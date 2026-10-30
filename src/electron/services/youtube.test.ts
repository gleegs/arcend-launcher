import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchLatestYoutubeVideo,
  parseLatestShortId,
  parseWatchPage,
  resetYoutubeCache,
} from './youtube'

vi.mock('./log', () => ({ sendLog: vi.fn() }))

const SHORTS_PAGE =
  '..."reelWatchEndpoint":{"videoId":"SSSSSSSSSSS","playerParams":"x"}...' +
  '"reelWatchEndpoint":{"videoId":"OOOOOOOOOOO"}'
const watchPage = (id: string, title: string, date: string) =>
  `{"videoDetails":{"videoId":"${id}","title":${JSON.stringify(title)},"lengthSeconds":"30"}` +
  `,"publishDate":"${date}"}`

function mockPages(pages: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = Object.entries(pages).find(([key]) => url.endsWith(key))?.[1]
      return body === undefined
        ? { ok: false, status: 404, text: async () => '' }
        : { ok: true, status: 200, text: async () => body }
    })
  )
}

describe('youtube parsers', () => {
  it('reads the first short id', () => {
    expect(parseLatestShortId(SHORTS_PAGE)).toBe('SSSSSSSSSSS')
    expect(parseLatestShortId('nothing')).toBeNull()
  })

  it('decodes the title and publish date of a watch page', () => {
    const page = watchPage(
      'SSSSSSSSSSS',
      'ARC 02 - HORROR 🔪 "DEMAIN"',
      '2026-10-29T10:58:20-07:00'
    )
    expect(parseWatchPage(page)).toEqual({
      title: 'ARC 02 - HORROR 🔪 "DEMAIN"',
      publishedAt: '2026-10-29T10:58:20-07:00',
    })
  })
})

describe('fetchLatestYoutubeVideo', () => {
  beforeEach(() => resetYoutubeCache())
  afterEach(() => vi.unstubAllGlobals())

  it('returns the latest short with its vertical thumbnail', async () => {
    mockPages({
      '/shorts': SHORTS_PAGE,
      'v=SSSSSSSSSSS': watchPage('SSSSSSSSSSS', 'Nouveau short', '2026-10-29T10:58:20-07:00'),
    })

    expect(await fetchLatestYoutubeVideo()).toEqual({
      id: 'SSSSSSSSSSS',
      title: 'Nouveau short',
      url: 'https://www.youtube.com/shorts/SSSSSSSSSSS',
      thumbnailUrl: 'https://i.ytimg.com/vi/SSSSSSSSSSS/oar2.jpg',
      publishedAt: '2026-10-29T10:58:20-07:00',
      isShort: true,
    })
  })

  it('still returns the short when its watch page is unavailable', async () => {
    mockPages({ '/shorts': SHORTS_PAGE })

    expect(await fetchLatestYoutubeVideo()).toMatchObject({
      id: 'SSSSSSSSSSS',
      title: 'Nouveau short',
      publishedAt: null,
    })
  })

  it('returns null when YouTube is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )

    expect(await fetchLatestYoutubeVideo()).toBeNull()
  })
})
