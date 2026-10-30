import { protocol, net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { imagesCacheDir } from '../lib/paths'

// Cache disque des images distantes (covers d'arc, vignettes, logos…), servies
// au renderer via le protocole `arcend-img://`.
//
// Stratégie :
//  - 1er affichage : téléchargement puis écriture sur disque (puis service).
//  - lancements suivants : service immédiat depuis le disque (instantané,
//    dispo hors-ligne) ET revalidation conditionnelle en arrière-plan
//    (If-None-Match / If-Modified-Since). Si l'image n'a pas changé côté
//    serveur → 304, zéro transfert ; sinon le fichier est rafraîchi et la
//    nouvelle version apparaît au lancement suivant.
//  - la taille totale du cache est plafonnée (éviction des plus anciens).

export const IMAGE_PROTOCOL = 'arcend-img'

// Plafond du cache d'images sur disque. Au-delà, on évince les fichiers les
// moins récemment rafraîchis (LRU par date de modification).
const MAX_CACHE_BYTES = 150 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

interface CacheMeta {
  etag?: string
  lastModified?: string
}

function guessMime(targetUrl: string): string {
  try {
    const ext = path.extname(new URL(targetUrl).pathname).toLowerCase()
    return MIME_BY_EXT[ext] ?? 'image/jpeg'
  } catch {
    return 'image/jpeg'
  }
}

function cachePathFor(targetUrl: string): string {
  const key = crypto.createHash('sha1').update(targetUrl).digest('hex')
  return path.join(imagesCacheDir, key)
}

function ensureCacheDir(): void {
  if (!fs.existsSync(imagesCacheDir)) {
    fs.mkdirSync(imagesCacheDir, { recursive: true })
  }
}

function readMeta(dest: string): CacheMeta | null {
  try {
    return JSON.parse(fs.readFileSync(`${dest}.meta`, 'utf-8')) as CacheMeta
  } catch {
    return null
  }
}

function writeMeta(dest: string, meta: CacheMeta): void {
  try {
    fs.writeFileSync(`${dest}.meta`, JSON.stringify(meta))
  } catch {
    // Métadonnées best-effort : une absence force juste un re-téléchargement.
  }
}

// Récupère l'image et l'écrit sur disque. Utilise une requête conditionnelle
// quand on a déjà un ETag / Last-Modified (304 = rien à télécharger). Renvoie
// true si le fichier sur disque est à jour.
async function fetchAndStore(targetUrl: string, dest: string): Promise<boolean> {
  const meta = readMeta(dest)
  const headers: Record<string, string> = {}
  if (meta?.etag) headers['If-None-Match'] = meta.etag
  if (meta?.lastModified) headers['If-Modified-Since'] = meta.lastModified

  const response = await fetch(targetUrl, { headers })

  if (response.status === 304) {
    // Inchangé : on met juste à jour la date (LRU).
    try {
      const now = new Date()
      fs.utimesSync(dest, now, now)
    } catch {
      // ignore
    }
    return true
  }
  if (!response.ok) return false

  const buffer = Buffer.from(await response.arrayBuffer())
  ensureCacheDir()
  fs.writeFileSync(dest, buffer)
  writeMeta(dest, {
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
  })
  return true
}

// Évite de revalider plusieurs fois la même URL en parallèle.
const revalidating = new Set<string>()

function revalidateInBackground(targetUrl: string, dest: string): void {
  if (revalidating.has(targetUrl)) return
  revalidating.add(targetUrl)
  fetchAndStore(targetUrl, dest)
    .catch(() => undefined)
    .finally(() => revalidating.delete(targetUrl))
}

// Plafonne la taille du cache en supprimant les fichiers les plus anciens.
function cleanupCache(): void {
  try {
    if (!fs.existsSync(imagesCacheDir)) return
    const entries = fs
      .readdirSync(imagesCacheDir)
      .filter((name) => !name.endsWith('.meta'))
      .map((name) => {
        const filePath = path.join(imagesCacheDir, name)
        const stat = fs.statSync(filePath)
        return { filePath, size: stat.size, mtime: stat.mtimeMs }
      })

    let total = entries.reduce((sum, entry) => sum + entry.size, 0)
    if (total <= MAX_CACHE_BYTES) return

    entries.sort((a, b) => a.mtime - b.mtime) // plus ancien d'abord
    for (const entry of entries) {
      if (total <= MAX_CACHE_BYTES) break
      try {
        fs.unlinkSync(entry.filePath)
        fs.rmSync(`${entry.filePath}.meta`, { force: true })
      } catch {
        // ignore
      }
      total -= entry.size
    }
  } catch {
    // Best-effort.
  }
}

export function registerImageProtocol(): void {
  cleanupCache()

  protocol.handle(IMAGE_PROTOCOL, async (request) => {
    const targetUrl = new URL(request.url).searchParams.get('u')
    if (!targetUrl) return new Response('missing url', { status: 400 })

    ensureCacheDir()
    const dest = cachePathFor(targetUrl)
    const headers = {
      'Content-Type': guessMime(targetUrl),
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    }

    // Déjà en cache : service immédiat + revalidation conditionnelle en fond.
    if (fs.existsSync(dest)) {
      revalidateInBackground(targetUrl, dest)
      const data = await fs.promises.readFile(dest)
      return new Response(data, { headers })
    }

    // Pas en cache : téléchargement synchrone.
    try {
      if (await fetchAndStore(targetUrl, dest)) {
        const data = await fs.promises.readFile(dest)
        return new Response(data, { headers })
      }
    } catch {
      // Réseau indisponible : on tente le distant ci-dessous.
    }

    return net.fetch(targetUrl)
  })
}
