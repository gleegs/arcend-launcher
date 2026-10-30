import type { LatestYoutubeVideo } from '../types/youtube'
import { sendLog } from './log'

// Chaîne YouTube Arcend (identique au site arcend.fr). On ne publie que des shorts.
const CHANNEL_URL = 'https://www.youtube.com/@arcendmc'
const CACHE_MS = 30 * 60 * 1000

// Pas d'API YouTube (clé requise) ni de flux RSS (404 sur la chaîne) : on lit les
// pages publiques. SOCS=CAI évite la page de consentement servie en Europe.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  Cookie: 'SOCS=CAI',
}

let cache: { at: number; video: LatestYoutubeVideo | null } | null = null

async function getPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`)
  return res.text()
}

/** Premier short de l'onglet Shorts (le plus récent). */
export function parseLatestShortId(html: string): string | null {
  return html.match(/"reelWatchEndpoint":\{"videoId":"([\w-]{11})"/)?.[1] ?? null
}

/** Titre et date de publication depuis la page de lecture. */
export function parseWatchPage(html: string): { title: string | null; publishedAt: string | null } {
  const rawTitle = html.match(
    /"videoDetails":\{"videoId":"[\w-]{11}","title":("(?:[^"\\]|\\.)*")/
  )?.[1]
  let title: string | null = null
  if (rawTitle) {
    try {
      title = JSON.parse(rawTitle) as string
    } catch {
      title = null
    }
  }
  const publishedAt = html.match(/"publishDate":"([^"]+)"/)?.[1] ?? null
  return { title, publishedAt }
}

/**
 * Dernier short de la chaîne. Mis en cache 30 min ; en cas d'échec, on garde le
 * dernier résultat connu.
 */
export async function fetchLatestYoutubeVideo(): Promise<LatestYoutubeVideo | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.video

  try {
    const id = parseLatestShortId(await getPage(`${CHANNEL_URL}/shorts`))
    if (!id) throw new Error('aucun short trouvé sur la chaîne')

    // Titre/date facultatifs : sans la page de lecture, on affiche quand même la miniature.
    const { title, publishedAt } = await getPage(`https://www.youtube.com/watch?v=${id}`)
      .then(parseWatchPage)
      .catch(() => ({ title: null, publishedAt: null }))

    const video: LatestYoutubeVideo = {
      id,
      title: title ?? 'Nouveau short',
      url: `https://www.youtube.com/shorts/${id}`,
      // Miniature verticale 1080×1920 des shorts (hqdefault est en 4:3 avec bandes noires).
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/oar2.jpg`,
      publishedAt,
      isShort: true,
    }
    cache = { at: Date.now(), video }
    return video
  } catch (error) {
    sendLog(
      'warn',
      `YouTube : dernier short indisponible (${error instanceof Error ? error.message : String(error)}).`
    )
    return cache?.video ?? null
  }
}

/** Réservé aux tests. */
export function resetYoutubeCache(): void {
  cache = null
}
