import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import { getMainWindow } from './window'
import { IpcChannels } from '../types/ipc'
import { arcsDir, arcRegistryPath } from '../lib/paths'
import { ensurePackwiz, getJarPath } from './packwiz'
import { ensureJava, getJavaExecutable } from './java'
import type { ArcInstallation, ArcRegistry, ArcInstallProgress, ArcMetadata } from '../types/arc'
import type { LogEntry, LogLevel } from '../types/launcher'

function getEmptyRegistry(): ArcRegistry {
  return { installations: {} }
}

// Ids de logs basés sur l'horloge pour ne pas entrer en collision avec ceux du
// launcher (petits entiers) ni du renderer (négatifs).
let packwizLogId = Date.now()

function classifyPackwizLine(line: string): LogLevel {
  const upper = line.toUpperCase()
  if (/EXCEPTION|FAILED|\bERROR\b|EXCLUDED|UNABLE|CANNOT|REFUSED|TIMED? ?OUT/.test(upper)) {
    return 'error'
  }
  if (/\bWARN/.test(upper)) return 'warn'
  return 'info'
}

// Envoie une ligne de la sortie packwiz vers les logs du renderer (onglet Logs).
function sendPackwizLog(level: LogLevel, message: string): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    const entry: LogEntry = {
      id: packwizLogId++,
      timestamp: Date.now(),
      level,
      message,
      source: 'launcher',
    }
    win.webContents.send(IpcChannels.LAUNCH_ON_LOG, entry)
  }
}

function sendProgress(progress: ArcInstallProgress): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.ARC_ON_INSTALL_PROGRESS, progress)
  }
}

export function getRegistry(): ArcRegistry {
  if (!fs.existsSync(arcRegistryPath)) {
    return getEmptyRegistry()
  }
  try {
    const raw = fs.readFileSync(arcRegistryPath, 'utf-8')
    return JSON.parse(raw) as ArcRegistry
  } catch {
    return getEmptyRegistry()
  }
}

function saveRegistry(registry: ArcRegistry): void {
  const dir = path.dirname(arcRegistryPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(arcRegistryPath, JSON.stringify(registry, null, 2), 'utf-8')
}

export function getArcPath(arcId: string): string {
  return path.join(arcsDir, arcId)
}

export function isInstalled(arcId: string): boolean {
  const registry = getRegistry()
  const installation = registry.installations[arcId]
  if (!installation) return false
  return fs.existsSync(installation.path)
}

export function getInstalledArcs(): ArcInstallation[] {
  const registry = getRegistry()
  return Object.values(registry.installations).filter((installation) =>
    fs.existsSync(installation.path)
  )
}

// Async (fs.promises) pour ne pas bloquer le process principal : un modpack
// fait des milliers de fichiers, un parcours sync figerait l'UI.
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0
  const files = await fs.promises.readdir(dirPath, { withFileTypes: true })
  for (const file of files) {
    const filePath = path.join(dirPath, file.name)
    if (file.isDirectory()) {
      totalSize += await getDirectorySize(filePath)
    } else {
      const stat = await fs.promises.stat(filePath)
      totalSize += stat.size
    }
  }
  return totalSize
}

function cleanupArcInstall(arcId: string, arcPath: string): void {
  if (fs.existsSync(arcPath)) {
    fs.rmSync(arcPath, { recursive: true, force: true })
  }
  const registry = getRegistry()
  delete registry.installations[arcId]
  saveRegistry(registry)
}

interface PackwizProgress {
  /** Index du fichier courant (x dans « (x/y) »). */
  current: number
  /** Nombre total de fichiers (y dans « (x/y) »). */
  total: number
}

/**
 * Extrait la progression Packwiz d'un chunk de stdout.
 *
 * Packwiz log chaque fichier traité au format `(x/y) filename status`, ex :
 *   (1/1153) aether-compat.pw.toml already exists (cached)
 *   (2/1153) README.md already exists (validated)
 *
 * On capture le max de `x` vu et la valeur de `y` (constante pour un pack
 * donné). Plusieurs lignes peuvent matcher dans un même chunk.
 */
const PACKWIZ_LINE_PATTERN = /\((\d+)\/(\d+)\)\s+\S+/g

function extractPackwizProgress(chunk: string): PackwizProgress | null {
  let current = 0
  let total = 0
  const pattern = new RegExp(PACKWIZ_LINE_PATTERN.source, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(chunk)) !== null) {
    const x = Number.parseInt(match[1], 10)
    const y = Number.parseInt(match[2], 10)
    if (!Number.isNaN(x) && x > current) current = x
    if (!Number.isNaN(y) && y > 0) total = y
  }
  if (current === 0 && total === 0) return null
  return { current, total }
}

/**
 * Calcule un percent linéaire pour la phase syncing_packwiz à partir de
 * l'avancement réel (x/y) retourné par Packwiz. Résultat borné [25, 75] en
 * local, qui sera ensuite remappé sur la plage globale Arc par le renderer.
 */
function computeModsPercent(current: number, total: number): number {
  if (total <= 0) return 25
  const ratio = Math.max(0, Math.min(1, current / total))
  return 25 + Math.floor(ratio * 50)
}

async function runPackwiz(
  mcPath: string,
  packwizUrl: string,
  javaVersion: string,
  onProgress?: (progress: PackwizProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const packwizJar = getJarPath()
  const javaPath = getJavaExecutable(javaVersion)

  return new Promise((resolve, reject) => {
    const args = ['-Dfile.encoding=UTF-8', '-jar', packwizJar, '--no-gui', packwizUrl]

    // `signal` permet d'annuler la synchro (le process est tué à l'abort).
    const process = spawn(javaPath, args, { cwd: mcPath, signal })

    let stdout = ''
    let stderr = ''
    // Buffer des lignes partielles : un chunk peut couper une ligne `(x/y)`
    // en deux. On attend le prochain chunk pour compléter la ligne avant de
    // la parser.
    let pendingLine = ''
    let lastReportedCurrent = 0

    process.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk

      pendingLine += chunk
      const lines = pendingLine.split('\n')
      // Le dernier élément est soit '' (si chunk finit par \n) soit une ligne
      // incomplète à conserver pour le prochain chunk.
      pendingLine = lines.pop() ?? ''

      for (const line of lines) {
        const progress = extractPackwizProgress(line)
        if (progress) {
          // Ligne de progression « (x/y) … » : on la consomme pour le percent
          // mais on ne la log pas (bruit : ~1 ligne par mod).
          if (onProgress && progress.current > lastReportedCurrent) {
            lastReportedCurrent = progress.current
            onProgress(progress)
          }
        } else if (line.trim()) {
          // Lignes de statut / erreurs → logs (onglet Logs).
          sendPackwizLog(classifyPackwizLine(line), `[packwiz] ${line.trim()}`)
        }
      }
    })

    process.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      for (const line of chunk.split('\n')) {
        if (line.trim()) sendPackwizLog('error', `[packwiz] ${line.trim()}`)
      }
    })

    process.on('close', (code) => {
      // Flush d'une éventuelle ligne restante sans \n final.
      if (pendingLine.length > 0) {
        const progress = extractPackwizProgress(pendingLine)
        if (progress) {
          if (onProgress && progress.current > lastReportedCurrent) {
            onProgress(progress)
          }
        } else if (pendingLine.trim()) {
          sendPackwizLog(classifyPackwizLine(pendingLine), `[packwiz] ${pendingLine.trim()}`)
        }
      }
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Packwiz failed with code ${code}: ${stderr || stdout}`))
      }
    })

    process.on('error', (err) => {
      reject(new Error(`Failed to spawn packwiz: ${err.message}`))
    })
  })
}

// Un modpack peut faire des dizaines de requêtes HTTP (une par mod). Il suffit
// qu'une seule expire (SocketTimeoutException) pour que packwiz sorte en erreur
// et fasse échouer toute l'installation. Ces timeouts sont quasi toujours
// transitoires côté réseau du joueur.
const PACKWIZ_MAX_ATTEMPTS = 3
const PACKWIZ_RETRY_DELAY_MS = 2000

/** `true` si l'erreur packwiz ressemble à une panne réseau transitoire (donc ré-essayable). */
function isTransientPackwizError(message: string): boolean {
  return /SocketTimeoutException|SocketException|timeout|Connection reset|UnknownHostException|RequestFailed|HTTP request failed|failed to connect|Read timed out/i.test(
    message
  )
}

/**
 * Exécute packwiz avec retry sur les erreurs réseau transitoires. packwiz étant
 * incrémental (il ne re-télécharge que les fichiers manquants), relancer après un
 * timeout reprend là où ça s'est arrêté. On ne ré-essaie pas si l'utilisateur a
 * annulé (signal aborté) ni sur une erreur non réseau (ex. pack.toml invalide).
 */
async function runPackwizWithRetry(
  mcPath: string,
  packwizUrl: string,
  javaVersion: string,
  onProgress?: (progress: PackwizProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= PACKWIZ_MAX_ATTEMPTS; attempt++) {
    try {
      await runPackwiz(mcPath, packwizUrl, javaVersion, onProgress, signal)
      return
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)

      if (signal?.aborted) throw error
      if (attempt >= PACKWIZ_MAX_ATTEMPTS || !isTransientPackwizError(message)) throw error

      sendPackwizLog(
        'warn',
        `[packwiz] Échec réseau (tentative ${attempt}/${PACKWIZ_MAX_ATTEMPTS}), nouvelle tentative dans ${PACKWIZ_RETRY_DELAY_MS / 1000}s…`
      )
      await new Promise((r) => setTimeout(r, PACKWIZ_RETRY_DELAY_MS))
    }
  }
  throw lastError
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          fetchText(res.headers.location).then(resolve).catch(reject)
          return
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} pour ${url}`))
          return
        }
        let data = ''
        res.on('data', (chunk: Buffer) => (data += chunk))
        res.on('end', () => resolve(data))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

function parsePackToml(content: string): { mcVersion: string } {
  const mcVersionMatch = content.match(/minecraft\s*=\s*"([^"]+)"/)
  if (!mcVersionMatch) {
    throw new Error('Version Minecraft non trouvée dans pack.toml')
  }

  return { mcVersion: mcVersionMatch[1] }
}

/**
 * Résout la source du `pack.toml` utilisée par packwiz et pour la lecture de la
 * version Minecraft. En mode DEV (`!app.isPackaged`), la variable
 * d'environnement `ARCEND_PACK_TOML_URL` permet de pointer vers un `pack.toml`
 * local servi par `packwiz serve` (ex: http://localhost:8080/pack.toml) afin de
 * tester un modpack sans dépendre de l'URL distante configurée dans Supabase.
 */
function getPackTomlSource(metadata: ArcMetadata): string {
  const override = process.env.ARCEND_PACK_TOML_URL
  if (override && !app.isPackaged) {
    return override
  }
  return metadata.packwizUrl
}

async function resolveMetadata(metadata: ArcMetadata): Promise<ArcMetadata> {
  if (metadata.mcVersion) return metadata

  const packToml = await fetchText(getPackTomlSource(metadata))
  const { mcVersion } = parsePackToml(packToml)

  return { ...metadata, mcVersion }
}

export async function installArc(arcId: string, metadata: ArcMetadata): Promise<ArcInstallation> {
  if (!fs.existsSync(arcsDir)) {
    fs.mkdirSync(arcsDir, { recursive: true })
  }

  const arcPath = getArcPath(arcId)
  const mcPath = path.join(arcPath, 'minecraft')

  try {
    // Ordre chronologique aligné sur les plages de progression du renderer :
    //   Java [0, 40] → Packwiz bootstrap [40, 50] → Arc sync [50, 100]
    // `ensurePackwiz` ne fait que télécharger un jar (~99 Ko), il n'a pas
    // besoin de Java pour s'exécuter. On peut donc le faire APRÈS ensureJava
    // sans dépendance, ce qui évite la régression visuelle Packwiz → Java.
    const javaVersion = metadata.javaVersion || '21'
    await ensureJava(javaVersion)
    await ensurePackwiz()

    sendProgress({ arcId, percent: 0, status: 'creating_folder' })

    const resolvedMetadata = await resolveMetadata(metadata)

    if (fs.existsSync(arcPath)) {
      await fs.promises.rm(arcPath, { recursive: true, force: true })
    }
    fs.mkdirSync(mcPath, { recursive: true })

    sendProgress({ arcId, percent: 25, status: 'syncing_packwiz', modsDownloaded: 0 })

    await runPackwizWithRetry(
      mcPath,
      getPackTomlSource(resolvedMetadata),
      resolvedMetadata.javaVersion,
      ({ current, total }) => {
        sendProgress({
          arcId,
          percent: computeModsPercent(current, total),
          status: 'syncing_packwiz',
          modsDownloaded: current,
          modsTotal: total,
        })
      }
    )

    sendProgress({ arcId, percent: 75, status: 'creating_metadata' })

    const arcJsonPath = path.join(arcPath, 'arc.json')
    fs.writeFileSync(arcJsonPath, JSON.stringify(resolvedMetadata, null, 2), 'utf-8')

    const size = await getDirectorySize(arcPath)

    const installation: ArcInstallation = {
      arcId,
      path: arcPath,
      installedAt: new Date().toISOString(),
      metadata: resolvedMetadata,
      size,
    }

    const registry = getRegistry()
    registry.installations[arcId] = installation
    saveRegistry(registry)

    sendProgress({ arcId, percent: 100, status: 'done' })

    return installation
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendPackwizLog('error', `Échec de l'installation : ${message}`)
    cleanupArcInstall(arcId, arcPath)
    sendProgress({
      arcId,
      percent: 0,
      status: 'error',
      error: message,
    })
    throw error
  }
}

/**
 * Re-synchronise les mods d'un arc déjà installé avec son `pack.toml` distant
 * (packwiz). Utilisé comme vérification du modpack à chaque lancement :
 * restaure/met à jour les mods et retire ceux qui ne sont plus dans le pack.
 * La sortie packwiz (statuts + erreurs) est routée vers les logs.
 */
export async function syncArcModpack(arcId: string, signal?: AbortSignal): Promise<void> {
  const installation = getRegistry().installations[arcId]
  if (!installation) {
    throw new Error(`Arc "${arcId}" n'est pas installé.`)
  }
  const mcPath = path.join(getArcPath(arcId), 'minecraft')
  const javaVersion = installation.metadata.javaVersion || '21'
  await ensureJava(javaVersion)
  await ensurePackwiz()
  await runPackwizWithRetry(
    mcPath,
    getPackTomlSource(installation.metadata),
    javaVersion,
    undefined,
    signal
  )
}

export function uninstallArc(arcId: string): void {
  const installation = getRegistry().installations[arcId]
  if (!installation) {
    throw new Error(`Arc ${arcId} is not installed`)
  }

  if (fs.existsSync(installation.path)) {
    fs.rmSync(installation.path, { recursive: true, force: true })
  }

  const registry = getRegistry()
  delete registry.installations[arcId]
  saveRegistry(registry)
}
