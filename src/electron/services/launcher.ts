import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import https from 'node:https'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { Client, type ILauncherOptions, type IUser } from 'minecraft-launcher-core'
import { getMainWindow, hideWindow, restoreWindow } from './window'
import { IpcChannels } from '../types/ipc'
import type { CachedProfile } from '../types/ipc'
import { getConfig } from './store'
import { auth, decryptToken } from './auth'
import { getArcPath, getRegistry as getArcRegistry, syncArcModpack } from './arc'
import { migrateKeybinds } from './keybindsMigration'
import { ensureJava, getJavaExecutable } from './java'
import type {
  LaunchOptions,
  LaunchProgress,
  LogLevel,
  LogEntry,
  LogSource,
} from '../types/launcher'

let activeLauncher: Client | null = null
let activeGameChild: ChildProcess | null = null
let launchAbort: AbortController | null = null

let logIdCounter = 0

function sendProgress(progress: LaunchProgress): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.LAUNCH_ON_PROGRESS, progress)
  }
}

function sendLog(level: LogLevel, message: string, source: LogSource): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    const entry: LogEntry = {
      id: ++logIdCounter,
      timestamp: Date.now(),
      level,
      message,
      source,
    }
    win.webContents.send(IpcChannels.LAUNCH_ON_LOG, entry)
  }
}

function classifyLine(line: string): LogLevel {
  const upper = line.toUpperCase()
  if (/\b(ERROR|EXCEPTION|FATAL|FAILED|CRASH)\b/.test(upper)) return 'error'
  if (/\b(WARN|WARNING)\b/.test(upper)) return 'warn'
  return 'info'
}

function createOfflineToken(profile: CachedProfile): IUser {
  return {
    access_token: crypto.randomBytes(16).toString('hex'),
    client_token: crypto.randomUUID(),
    uuid: profile.id.replace(/-/g, ''),
    name: profile.name,
    user_properties: {},
    meta: {
      type: 'mojang',
      demo: false,
    },
  }
}

async function getOnlineToken(): Promise<IUser> {
  const encryptedToken = getConfig('encryptedRefreshToken')
  if (!encryptedToken) {
    throw new Error("Aucun token d'authentification trouvé. Veuillez vous connecter.")
  }

  sendLog('info', 'Décryptage du token...', 'launcher')
  const refreshToken = decryptToken(encryptedToken)
  if (!refreshToken) {
    throw new Error("Impossible de décrypter le token d'authentification.")
  }

  sendLog('info', 'Rafraîchissement du token Microsoft...', 'launcher')
  const xbox = await auth.refresh(refreshToken)

  sendLog('info', 'Récupération du profil Minecraft...', 'launcher')
  const minecraft = await xbox.getMinecraft()
  if (!minecraft.profile) {
    throw new Error('Profil Minecraft non trouvé. Veuillez vous reconnecter.')
  }

  sendLog('info', `Connecté en tant que ${minecraft.profile.name}`, 'launcher')
  return minecraft.mclc() as IUser
}

function getOfflineToken(): IUser {
  const cached = getConfig('cachedProfile')
  if (!cached) {
    throw new Error('Aucun profil en cache. Veuillez vous connecter au moins une fois.')
  }
  sendLog('info', `Connecté hors ligne en tant que ${cached.name}`, 'launcher')
  return createOfflineToken(cached)
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const doRequest = (requestUrl: string) => {
      const client = requestUrl.startsWith('https') ? https : http
      client
        .get(requestUrl, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            doRequest(res.headers.location)
            return
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`))
            return
          }
          const file = fs.createWriteStream(destPath)
          res.pipe(file)
          file.on('finish', () => file.close(() => resolve()))
        })
        .on('error', (err) => {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
          reject(err)
        })
    }

    doRequest(url)
  })
}

async function ensureModLoaderInstaller(
  arcPath: string,
  modLoader: { type: string; version: string; installerUrl: string }
): Promise<string> {
  const installerName = `${modLoader.type}-${modLoader.version}-installer.jar`
  const installerPath = path.join(arcPath, installerName)

  if (fs.existsSync(installerPath)) {
    return installerPath
  }

  await downloadFile(modLoader.installerUrl, installerPath)

  return installerPath
}

export async function launchGame(options: LaunchOptions): Promise<void> {
  if (activeLauncher || launchAbort) {
    throw new Error("Un jeu est déjà en cours d'exécution.")
  }

  // Permet d'annuler le lancement (synchro packwiz et/ou process du jeu) via
  // cancelLaunch(). Le signal est propagé à packwiz et coupe son process.
  const abort = new AbortController()
  launchAbort = abort

  try {
    await runLaunch(options, abort)
  } finally {
    // Quel que soit le chemin de sortie (jeu fermé, erreur, annulation), on
    // libère l'état de lancement pour permettre un nouvel essai.
    launchAbort = null
    activeGameChild = null
  }
}

async function runLaunch(options: LaunchOptions, abort: AbortController): Promise<void> {
  const { arcId, mode, maxMemory = '4G', minMemory = '2G' } = options

  sendProgress({ status: 'validating_arc', percent: 0 })
  sendLog('info', `Lancement de l'arc "${arcId}" (${mode})`, 'launcher')

  const arcRegistry = getArcRegistry()
  const installation = arcRegistry.installations[arcId]
  if (!installation) {
    sendLog('error', `Arc "${arcId}" non installé`, 'launcher')
    throw new Error(`Arc "${arcId}" n'est pas installé.`)
  }

  const arcPath = getArcPath(arcId)
  const mcPath = path.join(arcPath, 'minecraft')
  if (!fs.existsSync(mcPath)) {
    sendLog('error', `Dossier minecraft introuvable pour "${arcId}"`, 'launcher')
    throw new Error(`Dossier minecraft introuvable pour l'arc "${arcId}".`)
  }

  sendLog('info', 'Arc validé', 'launcher')

  // Synchronisation du modpack à chaque lancement : packwiz met les mods en
  // conformité avec le pack.toml du serveur (détail dans les logs). En cas
  // d'échec, on n'enchaîne pas sur un modpack incorrect.
  sendProgress({ status: 'validating_arc', percent: 5 })
  sendLog('info', 'Synchronisation du modpack…', 'launcher')
  try {
    await syncArcModpack(arcId, abort.signal)
    sendLog('info', 'Modpack à jour', 'launcher')
  } catch (error) {
    // Annulation utilisateur : cancelLaunch() a déjà nettoyé l'état et envoyé
    // la progression, on sort sans signaler d'erreur.
    if (abort.signal.aborted) {
      return
    }
    sendLog(
      'error',
      `Échec de la synchronisation du modpack : ${error instanceof Error ? error.message : String(error)}`,
      'launcher'
    )
    const userMessage = 'Échec de la synchronisation du modpack (voir les logs)'
    sendProgress({ status: 'error', percent: 0, error: userMessage })
    throw new Error(userMessage)
  }

  if (abort.signal.aborted) {
    return
  }

  // Reset one-shot des touches (voir keybindsMigration.ts) : corrige les joueurs
  // dont le options.txt a été pollué (mod "Better Options") avant la mise en
  // place de keybindings.txt. Non bloquant : en cas d'échec on lance quand même.
  try {
    const km = migrateKeybinds(mcPath)
    if (km.status === 'reset') {
      sendLog(
        'info',
        `Touches réinitialisées aux défauts du pack (${km.removed} lignes, backup : ${path.basename(km.backupPath)})`,
        'launcher'
      )
    }
  } catch (error) {
    sendLog(
      'warn',
      `Migration des touches ignorée : ${error instanceof Error ? error.message : String(error)}`,
      'launcher'
    )
  }

  sendProgress({ status: 'validating_auth', percent: 10 })
  sendLog(
    'info',
    mode === 'online' ? 'Authentification Microsoft...' : 'Mode hors ligne',
    'launcher'
  )

  if (!installation.metadata.mcVersion) {
    sendLog('error', `Version Minecraft manquante pour "${arcId}"`, 'launcher')
    throw new Error(
      `Arc "${arcId}" : version Minecraft non disponible. Veuillez réinstaller l'arc.`
    )
  }

  let userToken: IUser
  try {
    userToken = mode === 'online' ? await getOnlineToken() : getOfflineToken()
  } catch (error) {
    sendLog(
      'error',
      `Erreur d'authentification : ${error instanceof Error ? error.message : String(error)}`,
      'launcher'
    )
    throw new Error(
      `Erreur d'authentification : ${error instanceof Error ? error.message : String(error)}`
    )
  }

  // Annulation pendant l'auth : on s'arrête sans émettre d'autre progression
  // (sinon on réactiverait la barre après le `closed` envoyé par cancelLaunch).
  if (abort.signal.aborted) {
    return
  }

  sendProgress({ status: 'preparing_launch', percent: 30 })
  sendLog('info', 'Préparation du lancement...', 'launcher')

  const { mcVersion, modLoader, javaVersion } = installation.metadata

  let forgePath: string | undefined
  if (modLoader) {
    sendLog('info', `Mod loader ${modLoader.type} ${modLoader.version}`, 'launcher')
    forgePath = await ensureModLoaderInstaller(arcPath, modLoader)
    sendLog('info', 'Mod loader prêt', 'launcher')
  }

  if (abort.signal.aborted) {
    return
  }

  const resolvedJavaVersion = javaVersion || '21'
  sendLog('info', `Vérification de Java ${resolvedJavaVersion}...`, 'launcher')
  await ensureJava(resolvedJavaVersion)
  const javaPath = getJavaExecutable(resolvedJavaVersion)
  sendLog('info', `Java : ${javaPath}`, 'launcher')

  // Dernier point d'annulation avant que MCLC ne prenne la main : une fois la
  // préparation MCLC lancée (download assets/libs), elle n'est plus
  // interruptible — on ne peut que tuer le process du jeu une fois spawné.
  if (abort.signal.aborted) {
    return
  }

  const launcher = new Client()
  activeLauncher = launcher

  const launchOpts: ILauncherOptions = {
    authorization: userToken,
    root: mcPath,
    version: {
      number: mcVersion,
      type: 'release',
    },
    memory: {
      max: maxMemory,
      min: minMemory,
    },
    javaPath,
    forge: forgePath,
    overrides: {
      detached: false,
    },
  }

  return new Promise((resolve, reject) => {
    launcher.on('debug', (e: string) => {
      console.log(`[MCLC Debug] ${e}`)
      sendLog(classifyLine(e), e, 'game')
    })

    launcher.on('data', (e: string) => {
      console.log(`[MCLC] ${e}`)
      sendLog(classifyLine(e), e, 'game')
      if (e.includes('Setting user:')) {
        sendProgress({ status: 'running', percent: 100 })
        sendLog('info', 'Jeu lancé', 'launcher')
        hideWindow()
      }
    })

    launcher.on('close', (code: number | null) => {
      activeLauncher = null
      restoreWindow()

      sendLog(
        code === 0 || code === null ? 'info' : 'error',
        `Jeu fermé${code !== null ? ` (code ${code})` : ''}`,
        'launcher'
      )

      sendProgress({
        status: 'closed',
        percent: 100,
        exitCode: code,
      })

      resolve()
    })

    sendLog('info', `Lancement de Minecraft ${mcVersion}...`, 'launcher')
    sendLog('info', `Mémoire : ${minMemory} / ${maxMemory}`, 'launcher')
    sendProgress({ status: 'launching', percent: 60 })

    launcher
      .launch(launchOpts)
      .then((child) => {
        activeGameChild = (child as ChildProcess | null) ?? null
        // Annulation arrivée pendant que MCLC préparait/démarrait le jeu : le
        // process vient d'être spawné, on le tue immédiatement (avant que la
        // fenêtre du jeu n'ait le temps de s'afficher).
        if (abort.signal.aborted && activeGameChild) {
          sendLog('warn', 'Lancement annulé : arrêt du process du jeu', 'launcher')
          killGameProcess(activeGameChild)
          activeGameChild = null
        }
      })
      .catch((err: Error) => {
        activeLauncher = null
        restoreWindow()

        // Annulation utilisateur : cancelLaunch() a déjà envoyé la progression.
        if (abort.signal.aborted) {
          resolve()
          return
        }

        sendLog('error', `Erreur lors du lancement : ${err.message}`, 'launcher')

        sendProgress({
          status: 'error',
          percent: 0,
          error: err.message,
        })

        reject(new Error(`Erreur lors du lancement : ${err.message}`))
      })
  })
}

/**
 * Tue le process du jeu de manière fiable. `child.kill()` (SIGTERM) ne termine
 * pas toujours la JVM Minecraft sous Windows ; on passe par `taskkill /T /F`
 * pour couper tout l'arbre de process de force.
 */
function killGameProcess(child: ChildProcess): void {
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'])
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    // process déjà terminé
  }
}

export function cancelLaunch(): void {
  // Toujours tracé : permet de vérifier dans l'onglet Logs que le main reçoit
  // bien la demande (si ce message n'apparaît pas, le process principal tourne
  // sur du vieux code — relancer `npm start`).
  sendLog('warn', 'Annulation du lancement demandée', 'launcher')

  if (!activeLauncher && !launchAbort) {
    sendLog('info', 'Aucun lancement actif à annuler', 'launcher')
    return
  }

  // Coupe la synchro packwiz en cours (via le signal) et le process du jeu
  // s'il a déjà démarré.
  launchAbort?.abort()
  if (activeGameChild) {
    sendLog('warn', 'Arrêt du process du jeu', 'launcher')
    killGameProcess(activeGameChild)
    activeGameChild = null
  }
  activeLauncher = null

  sendLog('warn', 'Lancement annulé', 'launcher')
  sendProgress({ status: 'closed', percent: 0, exitCode: null })
  restoreWindow()
}

export function isGameRunning(): boolean {
  return activeLauncher !== null
}
