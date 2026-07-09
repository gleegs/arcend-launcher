import fs, { createWriteStream } from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { spawn } from 'node:child_process'
import AdmZip from 'adm-zip'
import { getMainWindow } from './window'
import { IpcChannels } from '../types/ipc'
import { runtimeDir, javaRegistryPath } from '../lib/paths'
import type { JavaInstallation, JavaInstallProgress, JavaRegistry } from '../types/java'
import type { LogEntry, LogLevel } from '../types/launcher'

function getEmptyRegistry(): JavaRegistry {
  return { installations: {} }
}

function sendProgress(progress: JavaInstallProgress): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.JAVA_ON_INSTALL_PROGRESS, progress)
  }
}

let javaLogId = Date.now()

function sendLog(level: LogLevel, message: string): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    const entry: LogEntry = {
      id: javaLogId++,
      timestamp: Date.now(),
      level,
      message,
      source: 'launcher',
    }
    win.webContents.send(IpcChannels.LAUNCH_ON_LOG, entry)
  }
}

// Adoptium nomme l'ARM « aarch64 » (pas « arm64 » comme Node.js). Une requête
// avec architecture=arm64 répond 404. On traduit donc process.arch vers le
// vocabulaire Adoptium.
function getAdoptiumArch(): string {
  return process.arch === 'arm64' ? 'aarch64' : 'x64'
}

export function getRegistry(): JavaRegistry {
  if (!fs.existsSync(javaRegistryPath)) {
    return getEmptyRegistry()
  }
  try {
    const raw = fs.readFileSync(javaRegistryPath, 'utf-8')
    return JSON.parse(raw) as JavaRegistry
  } catch {
    return getEmptyRegistry()
  }
}

function saveRegistry(registry: JavaRegistry): void {
  const dir = path.dirname(javaRegistryPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(javaRegistryPath, JSON.stringify(registry, null, 2), 'utf-8')
}

export function isInstalled(version: string): boolean {
  validateVersion(version)
  const registry = getRegistry()
  const entry = registry.installations[version]
  if (!entry) return false
  return fs.existsSync(entry.path)
}

function validateVersion(version: string): void {
  if (!version || typeof version !== 'string') {
    throw new Error('Java version is required')
  }
}

export function getJavaPath(version: string): string {
  validateVersion(version)
  return path.join(runtimeDir, `java-${version}`)
}

export function getJavaExecutable(version: string): string {
  validateVersion(version)
  if (!isInstalled(version)) {
    throw new Error(`Java ${version} is not installed`)
  }
  const registry = getRegistry()
  const entry = registry.installations[version]
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'
  const executablePath = path.join(entry.path, 'bin', exe)
  if (fs.existsSync(executablePath)) return executablePath
  throw new Error(`Java executable not found at ${executablePath}`)
}

interface AdoptiumAsset {
  binary: {
    package: {
      link: string
      name: string
      size: number
    }
  }
}

function buildApiError(version: string, arch: string, platform: string, status: number): Error {
  return new Error(`Adoptium API returned ${status} for ${arch}/${platform}/jre/Java ${version}`)
}

async function fetchJreDownloadUrl(version: string): Promise<{ url: string; size: number }> {
  const arch = getAdoptiumArch()
  const platform =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
  const imageType = 'jre'

  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${version}/hotspot?architecture=${arch}&image_type=${imageType}&os=${platform}&vendor=eclipse`

  return new Promise((resolve, reject) => {
    https
      .get(apiUrl, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirectUrl = res.headers.location
          https.get(redirectUrl, (redirectRes) => {
            if (redirectRes.statusCode && redirectRes.statusCode >= 400) {
              return reject(buildApiError(version, arch, platform, redirectRes.statusCode))
            }
            let data = ''
            redirectRes.on('data', (chunk) => (data += chunk))
            redirectRes.on('end', () => {
              try {
                const assets = JSON.parse(data) as AdoptiumAsset[]
                const asset = assets[0]
                if (!asset?.binary?.package?.link) {
                  return reject(new Error(`No JRE package found for Java ${version}`))
                }
                resolve({
                  url: asset.binary.package.link,
                  size: asset.binary.package.size,
                })
              } catch {
                reject(
                  new Error(
                    `Failed to parse Adoptium API response for Java ${version} (${arch}/${platform})`
                  )
                )
              }
            })
            redirectRes.on('error', reject)
          })
          return
        }

        if (res.statusCode && res.statusCode >= 400) {
          return reject(buildApiError(version, arch, platform, res.statusCode))
        }

        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const assets = JSON.parse(data) as AdoptiumAsset[]
            const asset = assets[0]
            if (!asset?.binary?.package?.link) {
              return reject(new Error(`No JRE package found for Java ${version}`))
            }
            resolve({
              url: asset.binary.package.link,
              size: asset.binary.package.size,
            })
          } catch {
            reject(
              new Error(
                `Failed to parse Adoptium API response for Java ${version} (${arch}/${platform})`
              )
            )
          }
        })
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

function downloadFile(
  url: string,
  destPath: string,
  totalSize: number,
  version: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const file = createWriteStream(destPath)
    let downloaded = 0
    let lastPercent = -1

    const doRequest = (requestUrl: string) => {
      https
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
            reject(new Error(`Download failed with status ${res.statusCode}`))
            return
          }

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            const percent = totalSize > 0 ? Math.floor((downloaded / totalSize) * 100) : 0
            if (percent !== lastPercent) {
              lastPercent = percent
              sendProgress({ version, percent, status: 'downloading' })
            }
          })

          res.pipe(file)

          file.on('finish', () => {
            file.close(() => resolve())
          })
        })
        .on('error', (err) => {
          fs.unlinkSync(destPath)
          reject(err)
        })
    }

    doRequest(url)
  })
}

async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/tar', ['-xzf', archivePath, '-C', destDir])
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      reject(new Error(`L'extraction tar a échoué (spawn) : ${err.message}`))
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`L'extraction tar a échoué (code ${code}) : ${stderr}`))
    })
  })
}

function flattenSingleNestedDir(installPath: string): void {
  const extractedDirs = fs.readdirSync(installPath)
  if (extractedDirs.length === 1) {
    const innerDir = path.join(installPath, extractedDirs[0])
    const stat = fs.statSync(innerDir)
    if (stat.isDirectory()) {
      const innerContents = fs.readdirSync(innerDir)
      for (const item of innerContents) {
        fs.renameSync(path.join(innerDir, item), path.join(installPath, item))
      }
      fs.rmdirSync(innerDir)
    }
  }
}

// macOS/Linux : les binaires Java (bin/java, jspawnhelper, …) doivent être
// exécutables. tar préserve normalement les bits Unix, mais on force le 0o755
// pour blinder tous les chemins d'extraction.
function makeBinariesExecutable(installPath: string): void {
  if (process.platform === 'win32') return
  const binDir = path.join(installPath, 'bin')
  if (!fs.existsSync(binDir)) return
  for (const name of fs.readdirSync(binDir)) {
    const file = path.join(binDir, name)
    try {
      if (fs.statSync(file).isFile()) {
        fs.chmodSync(file, 0o755)
      }
    } catch {
      // un binaire non chmodable ne doit pas planter l'install
    }
  }
}

async function extractJre(archivePath: string, version: string): Promise<string> {
  const installPath = getJavaPath(version)
  const isTarGz = archivePath.toLowerCase().endsWith('.tar.gz')
  sendProgress({ version, percent: 0, status: 'extracting' })
  sendLog('info', `Extraction de Java ${version} (${isTarGz ? 'tar.gz' : 'zip'})…`)

  if (fs.existsSync(installPath)) {
    await fs.promises.rm(installPath, { recursive: true, force: true })
  }
  fs.mkdirSync(installPath, { recursive: true })

  if (isTarGz) {
    await extractTarGz(archivePath, installPath)
  } else {
    const zip = new AdmZip(archivePath)
    const entries = zip.getEntries()

    const totalEntries = entries.length
    let extracted = 0

    for (const entry of entries) {
      zip.extractEntryTo(entry, installPath, true, true)
      extracted++
      // Throttle la progression et rend la main à la boucle d'événements toutes
      // les ~25 entrées : sinon l'extraction sync bloque le process principal
      // (UI/IPC/déplacement de fenêtre figés) pendant toute la durée.
      if (extracted % 25 === 0 || extracted === totalEntries) {
        sendProgress({
          version,
          percent: Math.floor((extracted / totalEntries) * 100),
          status: 'extracting',
        })
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
  }

  flattenSingleNestedDir(installPath)
  makeBinariesExecutable(installPath)

  sendProgress({ version, percent: 100, status: 'extracting' })
  sendLog('info', `Extraction de Java ${version} terminée.`)

  fs.unlinkSync(archivePath)

  return installPath
}

export async function installJava(version: string): Promise<JavaInstallation> {
  validateVersion(version)
  try {
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true })
    }

    const { url, size } = await fetchJreDownloadUrl(version)
    sendLog('info', `Téléchargement de Java ${version}…`)

    // Adoptium distribue macOS/Linux en .tar.gz et Windows en .zip : on dérive
    // l'extension du temp depuis l'URL réelle pour que l'extraction choisisse
    // la bonne méthode (tar vs AdmZip).
    const ext = url.toLowerCase().endsWith('.tar.gz') ? '.tar.gz' : '.zip'
    const tempArchive = path.join(runtimeDir, `java-${version}-temp${ext}`)
    await downloadFile(url, tempArchive, size, version)
    sendLog('info', `Téléchargement de Java ${version} terminé.`)

    const installPath = await extractJre(tempArchive, version)

    // Le registre stocke l'arch machine réelle (ex: arm64). La traduction vers
    // aarch64 (vocabulaire Adoptium) ne sert qu'à fetchJreDownloadUrl.
    const installation: JavaInstallation = {
      version,
      path: installPath,
      installedAt: new Date().toISOString(),
      arch: process.arch,
    }

    const registry = getRegistry()
    registry.installations[version] = installation
    saveRegistry(registry)

    sendProgress({ version, percent: 100, status: 'done' })
    sendLog('info', `Java ${version} installé (${process.arch}).`)

    return installation
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendLog('error', `Erreur lors de l'installation de Java ${version} : ${message}`)
    throw error
  }
}

export async function ensureJava(version: string): Promise<JavaInstallation> {
  validateVersion(version)
  const registry = getRegistry()
  const existing = registry.installations[version]

  if (existing && fs.existsSync(existing.path)) {
    return existing
  }

  return installJava(version)
}
