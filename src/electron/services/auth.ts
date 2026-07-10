import { app, safeStorage, session, type BrowserWindow } from 'electron'
import { Auth } from 'msmc'
import { getConfig, setConfig } from './store'
import { getMainWindow } from './window'
import { sendLog } from './log'
import type { AuthState, CachedProfile } from '../types/ipc'
import type { LogLevel } from '../types/launcher'

export const auth = new Auth('login')

/**
 * Session isolée et *non persistante* (pas de préfixe `persist:`) pour la fenêtre
 * de login Microsoft.
 *
 * Sans ça, msmc ouvre sa BrowserWindow sur la session par défaut de l'app : les
 * cookies `login.live.com` survivent aux redémarrages. Quand l'un d'eux est
 * périmé ou corrompu, Microsoft renvoie immédiatement vers l'URL de redirection
 * *sans* paramètre `code` (typiquement `?error=...`). msmc referme alors la
 * fenêtre aussitôt — le « popup d'une milliseconde » — et rejette
 * `error.gui.closed`. Le cookie n'étant jamais nettoyé, le joueur reste bloqué
 * définitivement. Une session neuve à chaque tentative rend l'état irrécupérable
 * impossible.
 */
const LOGIN_PARTITION = 'msmc-login'

function log(message: string, level: LogLevel = 'info'): void {
  sendLog(level, `[auth] ${message}`)
}

/** Masque les secrets (`code`, tokens) avant de faire apparaître une URL dans les logs. */
function redact(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of ['code', 'access_token', 'refresh_token', 'id_token']) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '***')
    }
    return parsed.toString()
  } catch {
    return url
  }
}

// msmc émet des événements de progression tout au long du flow OAuth
// (Microsoft -> Xbox Live -> XSTS -> Minecraft). C'est notre seule visibilité sur
// l'étape exacte à laquelle un joueur bloque.
auth.on?.('load', (code: string, message: string) => {
  log(`msmc: ${code} — ${message}`)
})

/**
 * msmc ne lève jamais d'`Error` : il jette des chaînes (`"error.gui.closed"`) ou
 * des objets bruts `{ response, ts }`. `String(error)` donnait donc
 * `"[object Object]"` côté IPC, et le renderer perdait toute information.
 */
async function describeAuthError(raw: unknown): Promise<Error> {
  if (raw instanceof Error) return raw

  if (typeof raw === 'string') {
    const hint =
      raw === 'error.gui.closed'
        ? " (fenêtre fermée avant réception du code — soit l'utilisateur a fermé la" +
          ' popup, soit Microsoft a redirigé sans code)'
        : ''
    return new Error(`${raw}${hint}`)
  }

  if (raw && typeof raw === 'object' && 'ts' in raw) {
    const { ts, response } = raw as {
      ts: string
      response?: { status: number; statusText: string; text: () => Promise<string> }
    }
    let detail = ''
    if (response) {
      let body = ''
      try {
        body = (await response.text()).slice(0, 500)
      } catch {
        /* corps déjà consommé ou illisible */
      }
      detail = ` (HTTP ${response.status} ${response.statusText}${body ? ` — ${body}` : ''})`
    }
    return new Error(`${ts}${detail}`)
  }

  return new Error(String(raw))
}

/**
 * Trace la navigation de la fenêtre de login msmc. On ne peut pas y accéder
 * directement (msmc la crée en interne), donc on l'intercepte à sa création.
 * Retourne une fonction de nettoyage.
 */
function watchLoginWindow(): () => void {
  if (!app?.on) return () => undefined

  const onCreated = (_event: unknown, win: BrowserWindow): void => {
    // Le seul autre BrowserWindow est la fenêtre principale, créée bien avant.
    log('fenêtre de login Microsoft ouverte')
    const wc = win.webContents

    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame) log(`navigation → ${redact(details.url)}`)
    })
    wc.on('did-redirect-navigation', (details) => {
      if (details.isMainFrame) log(`redirection → ${redact(details.url)}`)
    })
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      log(
        `échec de chargement (${errorCode} ${errorDescription}) sur ${redact(validatedURL)}`,
        'error'
      )
    })
    wc.on('did-finish-load', () => {
      const url = wc.getURL()
      log(`page chargée → ${redact(url)}`)
      reportOAuthOutcome(url)
    })

    win.once('closed', () => log('fenêtre de login Microsoft fermée'))
  }

  app.on('browser-window-created', onCreated)
  return () => app.removeListener('browser-window-created', onCreated)
}

/**
 * Si Microsoft redirige vers l'URL de callback sans `code`, msmc ferme la fenêtre
 * sans résoudre — sans jamais nous dire pourquoi. On lit nous-mêmes les
 * paramètres d'erreur OAuth pour l'afficher.
 */
function reportOAuthOutcome(url: string): void {
  if (!url.startsWith('https://login.live.com/oauth20_desktop.srf')) return

  let params: URLSearchParams
  try {
    params = new URL(url).searchParams
  } catch {
    return
  }

  if (params.has('code')) {
    log('code d’autorisation reçu, échange du token en cours')
    return
  }

  const error = params.get('error')
  const description = params.get('error_description')
  if (error) {
    log(
      `Microsoft a refusé la connexion : ${error} — ${description ?? 'sans description'}`,
      'error'
    )
  } else {
    log('redirection Microsoft sans code ni erreur — connexion impossible', 'error')
  }
}

/** Purge les cookies de la fenêtre de login, pour repartir d'un état propre. */
async function clearLoginSession(): Promise<void> {
  try {
    await session?.fromPartition(LOGIN_PARTITION)?.clearStorageData()
    log('session de login purgée')
  } catch (error) {
    log(`purge de la session de login impossible : ${String(error)}`, 'warn')
  }
}

function encryptToken(plainToken: string): string {
  const encrypted = safeStorage.encryptString(plainToken)
  return encrypted.toString('base64')
}

export function decryptToken(encryptedBase64: string): string | null {
  try {
    const buffer = Buffer.from(encryptedBase64, 'base64')
    return safeStorage.decryptString(buffer)
  } catch {
    return null
  }
}

function saveSession(refreshToken: string, profile: CachedProfile): void {
  if (safeStorage.isEncryptionAvailable()) {
    setConfig('encryptedRefreshToken', encryptToken(refreshToken))
    log('refresh token chiffré et sauvegardé')
  } else {
    // Sur Linux sans keyring, ou si le trousseau est indisponible : la session ne
    // survivra pas au redémarrage, le joueur retombera en mode hors ligne.
    log('chiffrement indisponible : le refresh token ne sera pas persisté', 'warn')
  }
  setConfig('cachedProfile', profile)
}

function clearSession(): void {
  setConfig('encryptedRefreshToken', undefined)
  setConfig('cachedProfile', undefined)
}

export async function login(): Promise<AuthState> {
  const mainWindow = getMainWindow()
  const stopWatching = watchLoginWindow()

  log('début du login Microsoft')

  try {
    const xbox = await auth.launch('electron', {
      width: 500,
      height: 650,
      resizable: false,
      parent: mainWindow ?? undefined,
      webPreferences: { partition: LOGIN_PARTITION },
    })
    log('authentification Xbox Live réussie')

    const minecraft = await xbox.getMinecraft()
    if (!minecraft.profile) {
      log('aucun profil Minecraft associé à ce compte Microsoft', 'error')
      throw new Error('No Minecraft profile found')
    }

    const profile: CachedProfile = {
      id: minecraft.profile.id,
      name: minecraft.profile.name,
    }
    log(`profil Minecraft récupéré : ${profile.name} (${profile.id})`)

    saveSession(xbox.save(), profile)
    log('login terminé avec succès')

    return { status: 'online', profile }
  } catch (raw) {
    const error = await describeAuthError(raw)
    log(`échec du login : ${error.message}`, 'error')
    throw error
  } finally {
    stopWatching()
  }
}

export async function refresh(): Promise<AuthState> {
  const cached = getConfig('cachedProfile')
  const encryptedToken = getConfig('encryptedRefreshToken')
  log(`refresh de session (profil en cache : ${cached?.name ?? 'aucun'})`)

  if (!encryptedToken || !safeStorage.isEncryptionAvailable()) {
    log('aucun refresh token exploitable', 'warn')
    if (cached) return { status: 'offline', profile: cached }
    return { status: 'unauthenticated' }
  }

  const refreshToken = decryptToken(encryptedToken)
  if (!refreshToken) {
    log('déchiffrement du refresh token impossible', 'warn')
    if (cached) return { status: 'offline', profile: cached }
    return { status: 'unauthenticated' }
  }

  try {
    const xbox = await auth.refresh(refreshToken)
    const minecraft = await xbox.getMinecraft()
    if (!minecraft.profile) {
      log('refresh : aucun profil Minecraft associé au compte', 'warn')
      if (cached) return { status: 'offline', profile: cached }
      return { status: 'unauthenticated' }
    }

    const profile: CachedProfile = {
      id: minecraft.profile.id,
      name: minecraft.profile.name,
    }

    saveSession(xbox.save(), profile)
    log(`refresh réussi : ${profile.name}`)

    return { status: 'online', profile }
  } catch (raw) {
    const error = await describeAuthError(raw)
    log(`échec du refresh : ${error.message}`, 'warn')
    if (cached) return { status: 'offline', profile: cached }
    return { status: 'unauthenticated' }
  }
}

export async function logout(): Promise<void> {
  log('déconnexion')
  clearSession()
  // Sans ça, les cookies Microsoft de la fenêtre de login survivent à la
  // déconnexion et le joueur ne peut pas changer de compte.
  await clearLoginSession()
}

export function getAuthState(): AuthState {
  const cached = getConfig('cachedProfile')
  const encryptedToken = getConfig('encryptedRefreshToken')

  if (encryptedToken && safeStorage.isEncryptionAvailable()) {
    const refreshToken = decryptToken(encryptedToken)
    if (refreshToken && cached) {
      return { status: 'online', profile: cached }
    }
  }

  if (cached) {
    return { status: 'offline', profile: cached }
  }

  return { status: 'unauthenticated' }
}
