import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import crypto from 'node:crypto'
import yauzl from 'yauzl'
import { getMainWindow } from './window'
import { IpcChannels } from '../types/ipc'
import { mapRegistryPath } from '../lib/paths'
import { getArcPath, isInstalled as isArcInstalled } from './arc'
import { fetchRemoteArc } from './supabase'
import type {
  MapDownloadMeta,
  MapDownloadProgress,
  MapInstallation,
  MapRegistry,
} from '../types/mapDownload'
import type { LogEntry, LogLevel } from '../types/launcher'

// ─── Progression & logs ───────────────────────────────────────────────────────

function sendProgress(progress: MapDownloadProgress): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.MAP_ON_DOWNLOAD_PROGRESS, progress)
  }
}

let mapLogId = Date.now()

function sendLog(level: LogLevel, message: string): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    const entry: LogEntry = {
      id: mapLogId++,
      timestamp: Date.now(),
      level,
      message: `[map] ${message}`,
      source: 'launcher',
    }
    win.webContents.send(IpcChannels.LAUNCH_ON_LOG, entry)
  }
}

// ─── Registre des maps installées ────────────────────────────────────────────

function getEmptyRegistry(): MapRegistry {
  return { installations: {} }
}

export function getMapRegistry(): MapRegistry {
  if (!fs.existsSync(mapRegistryPath)) {
    return getEmptyRegistry()
  }
  try {
    const raw = fs.readFileSync(mapRegistryPath, 'utf-8')
    return JSON.parse(raw) as MapRegistry
  } catch {
    return getEmptyRegistry()
  }
}

function saveMapRegistry(registry: MapRegistry): void {
  const dir = path.dirname(mapRegistryPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(mapRegistryPath, JSON.stringify(registry, null, 2), 'utf-8')
}

export function getMapInstallation(arcId: string): MapInstallation | null {
  const entry = getMapRegistry().installations[arcId]
  if (!entry) return null
  // Auto-guérison : une entrée dont le dossier a disparu est ignorée.
  if (!fs.existsSync(entry.worldPath)) return null
  return entry
}

export function uninstallMap(arcId: string): void {
  const registry = getMapRegistry()
  const entry = registry.installations[arcId]
  if (!entry) {
    throw new Error(`Aucune map installée pour l'arc "${arcId}".`)
  }

  if (fs.existsSync(entry.worldPath)) {
    fs.rmSync(entry.worldPath, { recursive: true, force: true })
  }
  delete registry.installations[arcId]
  saveMapRegistry(registry)

  // Nettoie aussi les éventuels restes d'un téléchargement interrompu.
  cleanupPartialFiles(getArcPath(arcId))
}

function cleanupPartialFiles(arcPath: string): void {
  for (const name of ['map.zip.part', 'map.zip', 'map-download.json']) {
    const file = path.join(arcPath, name)
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true })
    }
  }
}

// ─── Helpers purs (testables) ────────────────────────────────────────────────

/**
 * Pic d'occupation disque pendant l'installation : le zip est présent en
 * intégralité au moment où le monde extrait est écrit (le zip n'est supprimé
 * qu'après extraction réussie). Sans taille extraite connue, on l'estime
 * égale à la taille du zip.
 */
export function computeRequiredDiskSpaceBytes(
  zipBytes: number,
  extractedBytes: number | null
): number {
  return zipBytes + (extractedBytes ?? zipBytes)
}

/**
 * Un monde Minecraft se reconnaît à son `level.dat`. Le nom du dossier final
 * est dérivé du nom de fichier du zip (ex: `Arcend - ARC 01 - Prologue.zip` →
 * `Arcend - ARC 01 - Prologue`), assaini des caractères interdits.
 */
export function deriveWorldNameFromUrl(mapUrl: string): string {
  try {
    const base = decodeURIComponent(new URL(mapUrl).pathname.split('/').pop() ?? '')
    const stem = base.replace(/\.(zip|ZIP)$/, '').trim()
    return stem.replace(/[<>:"/\\|?*]+/g, '_') || 'arcend-map'
  } catch {
    return 'arcend-map'
  }
}

/** `true` si une erreur ressemble à une panne réseau transitoire (ré-essayable). */
export function isTransientNetworkError(message: string): boolean {
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|socket|timeout|connection|aborted|premature|network/i.test(
    message
  )
}

/**
 * Décide si un téléchargement partiel peut être repris : le fichier `.part`
 * doit exister, porter sur le même objet (ETag et taille identiques) et être
 * incomplet. Sans ETag connu des deux côtés, on ne reprend pas (impossible de
 * garantir que le contenu n'a pas changé) — S3 en fournit toujours un.
 */
export function canResume(
  meta: MapDownloadMeta | null,
  partExists: boolean,
  currentEtag: string | null,
  currentTotalBytes: number | null
): boolean {
  if (!meta || !partExists) return false
  if (!meta.etag || !currentEtag || meta.etag !== currentEtag) return false
  if (currentTotalBytes == null || meta.totalBytes !== currentTotalBytes) return false
  return meta.downloadedBytes > 0 && meta.downloadedBytes < currentTotalBytes
}

/**
 * `true` si le zip final (`map.zip`) est déjà présent en intégralité sur
 * disque (ex: un échec d'extraction après un téléchargement réussi) — inutile
 * de retélécharger des dizaines de Go, on passe directement à l'extraction.
 */
export function shouldSkipDownload(
  existingZipBytes: number | null,
  totalBytes: number | null
): boolean {
  return totalBytes != null && existingZipBytes != null && existingZipBytes === totalBytes
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

interface HeadInfo {
  etag: string | null
  contentLength: number | null
}

interface ActiveDownload {
  arcId: string
  cancelled: boolean
  request: http.ClientRequest | null
  writeStream: fs.WriteStream | null
}

let activeMapDownload: ActiveDownload | null = null

export function isMapDownloadRunning(): boolean {
  return activeMapDownload !== null
}

export function cancelMapDownload(): void {
  if (!activeMapDownload) return
  activeMapDownload.cancelled = true
  sendLog('warn', 'Annulation du téléchargement demandée')
  activeMapDownload.request?.destroy(new Error('cancelled'))
  activeMapDownload.writeStream?.destroy()
}

/**
 * Requête HTTP avec suivi des redirections. Résout la réponse (non consommée).
 * La requête courante est enregistrée pour permettre l'annulation.
 */
function requestWithRedirects(
  url: string,
  options: https.RequestOptions,
  maxRedirects = 5
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.request(url, options, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location &&
        maxRedirects > 0
      ) {
        res.resume()
        const next = new URL(res.headers.location, url).toString()
        requestWithRedirects(next, options, maxRedirects - 1)
          .then(resolve)
          .catch(reject)
        return
      }
      if (activeMapDownload) {
        activeMapDownload.request = req
      }
      resolve(res)
    })
    req.on('error', reject)
    // Timeout « idle » : coupe une connexion morte sans données depuis 60 s.
    req.setTimeout(60_000, () => req.destroy(new Error('timeout')))
    req.end()
  })
}

async function headFile(url: string): Promise<HeadInfo> {
  const res = await requestWithRedirects(url, { method: 'HEAD' })
  res.resume()
  if (!res.statusCode || res.statusCode >= 400) {
    throw new Error(`La map est injoignable (HTTP ${res.statusCode}).`)
  }
  const contentLengthHeader = res.headers['content-length']
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null
  return {
    etag: res.headers.etag ?? null,
    contentLength: contentLength != null && Number.isFinite(contentLength) ? contentLength : null,
  }
}

// ─── Téléchargement résumable ────────────────────────────────────────────────

const MAP_DL_MAX_ATTEMPTS = 3
const MAP_DL_RETRY_DELAY_MS = 2000
const PROGRESS_THROTTLE_MS = 200
const META_SAVE_INTERVAL_MS = 2000

function readMeta(metaPath: string): MapDownloadMeta | null {
  try {
    if (!fs.existsSync(metaPath)) return null
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as MapDownloadMeta
  } catch {
    return null
  }
}

function writeMeta(metaPath: string, meta: MapDownloadMeta): void {
  fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf-8')
}

/** Amorce un hash SHA-256 avec les `bytes` premiers octets déjà téléchargés. */
function seedHashFromPart(partPath: string, bytes: number): crypto.Hash {
  const hash = crypto.createHash('sha256')
  if (bytes <= 0) return hash
  const fd = fs.openSync(partPath, 'r')
  try {
    const chunkSize = 4 * 1024 * 1024
    const buffer = Buffer.alloc(Math.min(chunkSize, bytes))
    let read = 0
    while (read < bytes) {
      const toRead = Math.min(chunkSize, bytes - read)
      const n = fs.readSync(fd, buffer, 0, toRead, read)
      if (n <= 0) break
      hash.update(buffer.subarray(0, n))
      read += n
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash
}

interface DownloadParams {
  arcId: string
  url: string
  etag: string | null
  totalBytes: number | null
  partPath: string
  metaPath: string
  expectedSha256: string | null
}

function downloadOnce(params: DownloadParams): Promise<number> {
  const { arcId, url, etag, totalBytes, partPath, metaPath, expectedSha256 } = params

  return new Promise<number>((resolve, reject) => {
    const meta = readMeta(metaPath)
    const partExists = fs.existsSync(partPath)
    const resumable = canResume(meta, partExists, etag, totalBytes)

    let start = resumable && meta ? meta.downloadedBytes : 0
    if (!resumable && partExists) {
      fs.rmSync(partPath, { force: true })
    }

    const headers: Record<string, string> = {}
    if (start > 0 && etag) {
      headers.Range = `bytes=${start}-`
      headers['If-Range'] = etag
    }

    requestWithRedirects(url, { method: 'GET', headers })
      .then((res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume()
          reject(new Error(`Téléchargement échoué (HTTP ${res.statusCode}).`))
          return
        }

        // 206 = reprise acceptée ; 200 = le serveur a renvoyé l'intégralité
        // (If-Range non satisfait ou requête sans Range) → on repart de zéro.
        if (res.statusCode === 200) {
          start = 0
          if (fs.existsSync(partPath)) {
            fs.rmSync(partPath, { force: true })
          }
        } else if (res.statusCode !== 206) {
          res.resume()
          reject(new Error(`Réponse HTTP inattendue (${res.statusCode}).`))
          return
        }

        // Le .part peut contenir plus d'octets que le méta (écriture en vol
        // lors d'une annulation) : on l'ajuste à la position de reprise.
        if (fs.existsSync(partPath)) {
          fs.truncateSync(partPath, start)
        } else if (start === 0) {
          fs.writeFileSync(partPath, '')
        }

        const hash =
          expectedSha256 && start > 0
            ? seedHashFromPart(partPath, start)
            : crypto.createHash('sha256')

        const writeStream = fs.createWriteStream(partPath, { flags: 'r+', start })
        if (activeMapDownload) {
          activeMapDownload.writeStream = writeStream
        }

        let downloaded = start
        let lastEmit = 0
        let lastMetaSave = Date.now()

        const emitProgress = (force = false): void => {
          const now = Date.now()
          if (!force && now - lastEmit < PROGRESS_THROTTLE_MS) return
          lastEmit = now
          const percent =
            totalBytes != null && totalBytes > 0
              ? Math.min(90, Math.floor((downloaded / totalBytes) * 90))
              : 0
          sendProgress({
            arcId,
            status: 'downloading',
            percent,
            processedBytes: downloaded,
            totalBytes: totalBytes ?? undefined,
          })
        }

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          hash.update(chunk)
          emitProgress()
          if (Date.now() - lastMetaSave > META_SAVE_INTERVAL_MS) {
            lastMetaSave = Date.now()
            writeMeta(metaPath, { etag, totalBytes: totalBytes ?? 0, downloadedBytes: downloaded })
          }
        })

        res.pipe(writeStream)

        writeStream.on('finish', () => {
          writeStream.close(() => {
            // Méta à jour immédiatement : une coupure juste après le finish
            // doit pouvoir reprendre (ou valider) à la position exacte.
            writeMeta(metaPath, { etag, totalBytes: totalBytes ?? 0, downloadedBytes: downloaded })

            if (totalBytes != null && downloaded !== totalBytes) {
              reject(
                new Error(
                  `Téléchargement incomplet (${downloaded}/${totalBytes} octets), la connexion a été coupée.`
                )
              )
              return
            }

            if (expectedSha256) {
              const actual = hash.digest('hex')
              if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
                // Fichier corrompu : inutile de conserver le partiel.
                fs.rmSync(partPath, { force: true })
                fs.rmSync(metaPath, { force: true })
                reject(
                  new Error('Vérification SHA-256 échouée : le fichier téléchargé est corrompu.')
                )
                return
              }
              sendLog('info', 'Vérification SHA-256 OK.')
            }

            resolve(downloaded)
          })
        })

        writeStream.on('error', reject)
        res.on('error', reject)
      })
      .catch(reject)
  })
}

async function downloadWithResume(params: DownloadParams): Promise<number> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAP_DL_MAX_ATTEMPTS; attempt++) {
    try {
      return await downloadOnce(params)
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)

      if (activeMapDownload?.cancelled) throw error
      if (attempt >= MAP_DL_MAX_ATTEMPTS || !isTransientNetworkError(message)) throw error

      sendLog(
        'warn',
        `Échec réseau (tentative ${attempt}/${MAP_DL_MAX_ATTEMPTS}), reprise dans ${MAP_DL_RETRY_DELAY_MS / 1000}s…`
      )
      await new Promise((r) => setTimeout(r, MAP_DL_RETRY_DELAY_MS))
    }
  }
  throw lastError
}

// ─── Extraction (yauzl, ZIP64, streaming) ────────────────────────────────────
//
// AdmZip refuse les fichiers > 2 GiB (« File size is greater than 2 GiB »),
// ce qui rendait l'extraction d'un zip de map (~35 Go) impossible. yauzl lit
// la central directory et extrait en streaming : pas de limite de taille et
// un support ZIP64 éprouvé sur les grosses archives.

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

/** Métadonnées parasites macOS présentes dans certains zips — ignorées. */
function isJunkEntry(fileName: string): boolean {
  return fileName.startsWith('__MACOSX/') || path.basename(fileName) === '.DS_Store'
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true, autoClose: false, decodeStrings: true },
      (err, zip) => {
        if (err || !zip) {
          reject(err ?? new Error('Archive illisible.'))
          return
        }
        resolve(zip)
      }
    )
  })
}

/**
 * Passe 1 : lit uniquement la central directory (quelques secondes même sur
 * 35 Go) pour compter les entrées et la taille totale décompressée — les
 * dénominateurs de la progression de la passe 2.
 */
async function scanZip(
  zipPath: string
): Promise<{ entryCount: number; totalUncompressed: number }> {
  const zip = await openZip(zipPath)
  return new Promise((resolve, reject) => {
    let entryCount = 0
    let totalUncompressed = 0

    zip.on('entry', (entry: yauzl.Entry) => {
      if (!isJunkEntry(entry.fileName)) {
        entryCount++
        totalUncompressed += entry.uncompressedSize
      }
      zip.readEntry()
    })
    zip.on('end', () => {
      zip.close()
      resolve({ entryCount, totalUncompressed })
    })
    zip.on('error', (err: Error) => {
      try {
        zip.close()
      } catch {
        // déjà fermé
      }
      reject(err)
    })
    zip.readEntry()
  })
}

/** Extrait une entrée fichier vers `destPath` en comptant les octets. */
function extractEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  destPath: string,
  onBytes: (delta: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, readStream) => {
      if (err || !readStream) {
        reject(err ?? new Error(`Flux de lecture indisponible pour "${entry.fileName}".`))
        return
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      const writeStream = fs.createWriteStream(destPath)
      if (activeMapDownload) {
        // Permet à cancelMapDownload() de couper l'extraction en cours.
        activeMapDownload.writeStream = writeStream
      }

      readStream.on('data', (chunk: Buffer) => onBytes(chunk.length))
      readStream.pipe(writeStream)
      writeStream.on('finish', () => writeStream.close(() => resolve()))
      writeStream.on('error', reject)
      readStream.on('error', reject)
    })
  })
}

/** Passe 2 : extraction séquentielle en streaming de toutes les entrées. */
async function extractZipEntries(
  zipPath: string,
  destDir: string,
  onBytes: (delta: number) => void
): Promise<void> {
  const zip = await openZip(zipPath)
  const destRoot = path.resolve(destDir)

  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('entry', (entry: yauzl.Entry) => {
        if (activeMapDownload?.cancelled) {
          reject(new Error('Téléchargement annulé.'))
          return
        }

        // Entrée dossier (nom finissant par '/') : création du répertoire.
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(path.join(destDir, entry.fileName), { recursive: true })
          zip.readEntry()
          return
        }

        if (isJunkEntry(entry.fileName)) {
          zip.readEntry()
          return
        }

        // Garde-fou anti-traversée : le chemin résolu doit rester dans destDir.
        const validation = yauzl.validateFileName(entry.fileName)
        const destPath = path.join(destDir, entry.fileName)
        const resolved = path.resolve(destPath)
        if (validation != null || !resolved.startsWith(destRoot + path.sep)) {
          reject(new Error(`Chemin d'entrée invalide dans le zip : "${entry.fileName}".`))
          return
        }

        // Séquentiel : on ne lit l'entrée suivante qu'une fois celle-ci
        // entièrement écrite (backpressure naturelle via le pipe).
        extractEntry(zip, entry, destPath, onBytes)
          .then(() => zip.readEntry())
          .catch(reject)
      })

      // La promesse se résout sur « end » : toutes les entrées (y compris
      // junk) doivent être consommées via readEntry() pour qu'il survienne.
      zip.on('end', () => resolve())
      zip.on('error', reject)
      zip.readEntry()
    })
  } finally {
    try {
      zip.close()
    } catch {
      // déjà fermé
    }
  }
}

/**
 * Détecte la structure du zip extrait dans `dir` :
 * - `level.dat` à la racine → il faut wrapper dans un dossier nommé ;
 * - un dossier racine unique contenant `level.dat` → monde déjà nommé.
 * Retourne le dossier du monde et son nom final, ou null si non reconnu.
 */
export function detectWorldLayout(dir: string): { worldDir: string; name: string } | null {
  if (fs.existsSync(path.join(dir, 'level.dat'))) {
    return { worldDir: dir, name: '' }
  }
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
  if (entries.length === 1 && fs.existsSync(path.join(dir, entries[0].name, 'level.dat'))) {
    return { worldDir: path.join(dir, entries[0].name), name: entries[0].name }
  }
  return null
}

async function extractMap(
  arcId: string,
  zipPath: string,
  savesDir: string,
  fallbackWorldName: string
): Promise<{ worldPath: string; size: number }> {
  sendProgress({ arcId, status: 'extracting', percent: 90 })

  const tmpDir = path.join(path.dirname(zipPath), '.map-extract-tmp')
  if (fs.existsSync(tmpDir)) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
  }
  fs.mkdirSync(tmpDir, { recursive: true })

  const { entryCount, totalUncompressed } = await scanZip(zipPath)
  if (entryCount === 0) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
    throw new Error('Le zip de la map est vide ou illisible.')
  }

  sendLog('info', `Extraction de ${entryCount} entrées (${formatGb(totalUncompressed)})…`)

  let extractedBytes = 0
  let lastEmit = 0
  await extractZipEntries(zipPath, tmpDir, (delta) => {
    extractedBytes += delta
    const now = Date.now()
    if (now - lastEmit < PROGRESS_THROTTLE_MS) return
    lastEmit = now
    const ratio = Math.min(1, extractedBytes / Math.max(1, totalUncompressed))
    sendProgress({
      arcId,
      status: 'extracting',
      percent: 90 + Math.floor(ratio * 10),
      processedBytes: extractedBytes,
      totalBytes: totalUncompressed,
    })
  })
  sendProgress({
    arcId,
    status: 'extracting',
    percent: 100,
    processedBytes: totalUncompressed,
    totalBytes: totalUncompressed,
  })

  const layout = detectWorldLayout(tmpDir)
  if (!layout) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
    throw new Error(
      'Structure du zip non reconnue : aucun monde Minecraft (level.dat) trouvé à la racine ni dans un dossier racine unique.'
    )
  }

  const worldName = layout.name || fallbackWorldName
  if (!fs.existsSync(savesDir)) {
    fs.mkdirSync(savesDir, { recursive: true })
  }
  const targetPath = path.join(savesDir, worldName)

  // Un retéléchargement remplace le monde existant (l'UI a demandé
  // confirmation en amont) : on nettoie la cible avant le déplacement.
  if (fs.existsSync(targetPath)) {
    await fs.promises.rm(targetPath, { recursive: true, force: true })
  }
  fs.renameSync(layout.worldDir, targetPath)

  // Ménage : tmp restant (layout « racine » déplacé entièrement → vide),
  // archive et méta de téléchargement.
  await fs.promises.rm(tmpDir, { recursive: true, force: true })
  fs.rmSync(zipPath, { force: true })

  const size = await getDirectorySize(targetPath)
  return { worldPath: targetPath, size }
}

// ─── Orchestration ───────────────────────────────────────────────────────────

function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} Go`
}

export async function installMap(arcId: string): Promise<MapInstallation> {
  if (activeMapDownload) {
    throw new Error('Un téléchargement de map est déjà en cours.')
  }
  if (!isArcInstalled(arcId)) {
    throw new Error(`L'arc "${arcId}" doit être installé avant de télécharger sa map.`)
  }

  activeMapDownload = { arcId, cancelled: false, request: null, writeStream: null }
  const state = activeMapDownload

  const arcPath = getArcPath(arcId)
  const savesDir = path.join(arcPath, 'minecraft', 'saves')
  const partPath = path.join(arcPath, 'map.zip.part')
  const zipPath = path.join(arcPath, 'map.zip')
  const metaPath = path.join(arcPath, 'map-download.json')

  // Phase courante : permet d'afficher « Échec du téléchargement » vs
  // « Échec de l'extraction » selon l'endroit de l'échec.
  let phase: 'download' | 'extract' = 'download'

  try {
    sendProgress({ arcId, status: 'checking', percent: 0 })

    // L'URL n'est JAMAIS lue depuis le disque : toujours résolue depuis
    // l'arc remote du moment (Supabase d'abord, cache offline en secours).
    const remote = await fetchRemoteArc(arcId)
    const mapUrl = remote?.mapUrl
    if (!mapUrl) {
      throw new Error(`Aucune map disponible pour l'arc "${arcId}".`)
    }

    const { etag, contentLength } = await headFile(mapUrl)
    const totalBytes = contentLength
    const extractedBytes = remote?.mapExtractedSizeBytes ?? null

    // Un zip déjà complet sur le disque (échec d'extraction précédent) permet
    // de sauter le téléchargement et de repartir directement sur l'extraction.
    const existingZipBytes = fs.existsSync(zipPath) ? fs.statSync(zipPath).size : null
    const skipDownload = shouldSkipDownload(existingZipBytes, totalBytes)

    const previousMeta = readMeta(metaPath)
    const partExists = fs.existsSync(partPath)
    const resumable = canResume(previousMeta, partExists, etag, totalBytes)
    const alreadyHaveBytes = skipDownload
      ? (totalBytes ?? 0)
      : resumable
        ? (previousMeta?.downloadedBytes ?? 0)
        : 0

    // Vérification bloquante de l'espace disque : au pic, le zip complet et
    // le monde extrait coexistent avant la suppression de l'archive. Ne
    // compte que ce qui reste réellement à télécharger.
    if (totalBytes != null) {
      const remainingDownload = Math.max(0, totalBytes - alreadyHaveBytes)
      const required = computeRequiredDiskSpaceBytes(remainingDownload, extractedBytes)
      const stats = await fs.promises.statfs(arcPath)
      const available = stats.bavail * stats.bsize
      if (available < required) {
        throw new Error(
          `Espace disque insuffisant : ${formatGb(required)} requis (zip + extraction), ${formatGb(available)} disponibles. Libérez de l'espace ou changez de disque.`
        )
      }
    }

    if (skipDownload) {
      sendLog('info', 'Archive déjà présente sur le disque : extraction directe.')
    } else {
      if (resumable) {
        sendLog(
          'info',
          `Reprise du téléchargement à ${((previousMeta?.downloadedBytes ?? 0) / 1024 ** 3).toFixed(1)} Go.`
        )
      }

      sendLog('info', `Téléchargement de la map de l'arc "${arcId}"…`)
      await downloadWithResume({
        arcId,
        url: mapUrl,
        etag,
        totalBytes,
        partPath,
        metaPath,
        expectedSha256: remote?.mapSha256 ?? null,
      })

      fs.renameSync(partPath, zipPath)
    }
    fs.rmSync(metaPath, { force: true })

    phase = 'extract'
    sendProgress({ arcId, status: 'extracting', percent: 90 })
    sendLog('info', 'Extraction de la map…')

    const { worldPath, size } = await extractMap(
      arcId,
      zipPath,
      savesDir,
      deriveWorldNameFromUrl(mapUrl)
    )

    const installation: MapInstallation = {
      arcId,
      worldPath,
      installedAt: new Date().toISOString(),
      size,
    }
    const registry = getMapRegistry()
    registry.installations[arcId] = installation
    saveMapRegistry(registry)

    sendProgress({ arcId, status: 'done', percent: 100 })
    sendLog('info', `Map installée dans "${worldPath}" (${formatGb(size)}).`)

    return installation
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (state.cancelled) {
      // On conserve le .part + méta (ou le zip complet) pour reprendre ensuite.
      sendProgress({ arcId, status: 'cancelled', percent: 0 })
      sendLog('warn', 'Téléchargement de la map annulé (reprise possible).')
      throw new Error('Téléchargement annulé.')
    }

    const failureLabel =
      phase === 'extract' ? "Échec de l'extraction de la map" : 'Échec du téléchargement de la map'
    sendProgress({ arcId, status: 'error', percent: 0, error: message, errorPhase: phase })
    sendLog('error', `${failureLabel} : ${message}`)
    throw error
  } finally {
    activeMapDownload = null
  }
}
