import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeCacheDir = '/fake/arcend/cache'
const fakeServerStateCachePath = `${fakeCacheDir}/server-state.json`
const fakeRemoteArcsCachePath = `${fakeCacheDir}/remote-arcs.json`

vi.mock('../lib/paths', () => ({
  cacheDir: fakeCacheDir,
  remoteArcsCachePath: fakeRemoteArcsCachePath,
  serverStateCachePath: fakeServerStateCachePath,
}))

const { mockFsExistsSync, mockFsReadFileSync, mockFsMkdirSync, mockFsWriteFileSync } = vi.hoisted(
  () => ({
    mockFsExistsSync: vi.fn(),
    mockFsReadFileSync: vi.fn(),
    mockFsMkdirSync: vi.fn(),
    mockFsWriteFileSync: vi.fn(),
  })
)

vi.mock('node:fs', () => {
  const fns = {
    existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockFsReadFileSync(...args),
    mkdirSync: (...args: unknown[]) => mockFsMkdirSync(...args),
    writeFileSync: (...args: unknown[]) => mockFsWriteFileSync(...args),
  }
  return { __esModule: true, default: fns, ...fns }
})

const { mockMaybeSingle, mockEq, mockOrder, mockSelect, mockFrom, mockCreateClient } = vi.hoisted(
  () => {
    const mockMaybeSingle = vi.fn()
    const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockOrder = vi.fn()
    const mockSelect = vi.fn(() => ({ eq: mockEq, order: mockOrder }))
    const mockFrom = vi.fn(() => ({ select: mockSelect }))
    const mockCreateClient = vi.fn((..._args: unknown[]) => ({ from: mockFrom }))
    return { mockMaybeSingle, mockEq, mockOrder, mockSelect, mockFrom, mockCreateClient }
  }
)

vi.mock('electron', () => ({ app: { isPackaged: true } }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

const sampleRow = {
  arc_slug: 'arcend-prologue',
  active_release: '2.3.2',
  updated_at: '2026-10-01T05:00:00Z',
}

describe('supabase service — server_state', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFsExistsSync.mockReset()
    mockFsReadFileSync.mockReset()
    mockFsMkdirSync.mockReset()
    mockFsWriteFileSync.mockReset()
    mockMaybeSingle.mockReset()
    mockOrder.mockReset()
    mockEq.mockClear()
    mockSelect.mockClear()
    mockFrom.mockClear()
    mockCreateClient.mockClear()
    process.env.SUPABASE_URL = 'https://fake.supabase.co'
    process.env.SUPABASE_PUBLISHABLE_KEY = 'fake-publishable-key'
  })

  it('returns the mapped server state and writes the cache', async () => {
    mockMaybeSingle.mockResolvedValue({ data: sampleRow, error: null })

    const { fetchServerState } = await import('./supabase')
    const result = await fetchServerState('arcend-prologue')

    expect(result).toEqual({
      arcSlug: 'arcend-prologue',
      activeRelease: '2.3.2',
      updatedAt: '2026-10-01T05:00:00Z',
    })
    // Requête filtrée sur le slug de l'arc
    expect(mockFrom).toHaveBeenCalledWith('server_state')
    expect(mockEq).toHaveBeenCalledWith('arc_slug', 'arcend-prologue')
    // Cache network-first écrit pour le fallback offline
    expect(mockFsWriteFileSync).toHaveBeenCalledWith(
      fakeServerStateCachePath,
      expect.stringContaining('"activeRelease": "2.3.2"'),
      'utf-8'
    )
  })

  it('returns null when the arc has no server state (no cache write)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const { fetchServerState } = await import('./supabase')
    const result = await fetchServerState('unknown-arc')

    expect(result).toBeNull()
    expect(mockFsWriteFileSync).not.toHaveBeenCalled()
  })

  it('falls back to the cache when Supabase is unreachable', async () => {
    mockMaybeSingle.mockRejectedValue(new Error('fetch failed'))
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFileSync.mockImplementation((p: unknown) => {
      if (p === fakeServerStateCachePath) {
        return JSON.stringify({
          fetchedAt: '2026-09-30T05:00:00Z',
          serverState: {
            arcSlug: 'arcend-prologue',
            activeRelease: '2.3.1',
            updatedAt: '2026-09-30T05:00:00Z',
          },
        })
      }
      return ''
    })

    const { fetchServerState } = await import('./supabase')
    const result = await fetchServerState('arcend-prologue')

    expect(result).toEqual({
      arcSlug: 'arcend-prologue',
      activeRelease: '2.3.1',
      updatedAt: '2026-09-30T05:00:00Z',
    })
  })

  it('ignores the cached state of another arc when Supabase is unreachable', async () => {
    mockMaybeSingle.mockRejectedValue(new Error('fetch failed'))
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFileSync.mockImplementation((p: unknown) => {
      if (p === fakeServerStateCachePath) {
        return JSON.stringify({
          fetchedAt: '2026-09-30T05:00:00Z',
          serverState: {
            arcSlug: 'arcend-prologue',
            activeRelease: '2.3.2',
            updatedAt: '2026-09-30T05:00:00Z',
          },
        })
      }
      return ''
    })

    const { fetchServerState } = await import('./supabase')
    const result = await fetchServerState('arcend-arc02')

    // Sans ce filtre, la release 2.3.2 de l'Arc 01 serait installée dans l'Arc 02.
    expect(result).toBeNull()
  })

  it('accepts the legacy bare-object cache format', async () => {
    mockMaybeSingle.mockRejectedValue(new Error('fetch failed'))
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFileSync.mockImplementation((p: unknown) => {
      if (p === fakeServerStateCachePath) {
        return JSON.stringify({
          arcSlug: 'arcend-prologue',
          activeRelease: '2.3.0',
          updatedAt: '2026-09-01T05:00:00Z',
        })
      }
      return ''
    })

    const { fetchServerState } = await import('./supabase')
    const result = await fetchServerState('arcend-prologue')

    expect(result?.activeRelease).toBe('2.3.0')
  })

  it('returns null without env vars and without cache', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    mockFsExistsSync.mockReturnValue(false)

    const { fetchServerState } = await import('./supabase')
    const result = await fetchServerState('arcend-prologue')

    expect(result).toBeNull()
  })
})

const sampleArcRow = {
  slug: 'arcend-arc02',
  name: 'Cave Horror',
  description: null,
  version: null,
  start_date: '2026-10-20T18:00:00Z',
  end_date: '2026-11-03T22:00:00Z',
  mc_version: '1.20.1',
  java_version: '17',
  loader: 'forge',
  loader_version: '47.4.23',
  loader_install_url: 'https://example.com/forge-installer.jar',
  modpack_url: 'https://example.com/arc02/releases/0.2.0/pack.toml',
  cover_url: null,
  thumbnail_url: null,
  logo_url: null,
  created_at: '2026-10-19T00:00:00Z',
  map_url: null,
  map_extracted_size_bytes: null,
  map_sha256: null,
}

describe('supabase service — arcs', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFsExistsSync.mockReset()
    mockFsReadFileSync.mockReset()
    mockFsWriteFileSync.mockReset()
    mockOrder.mockReset()
    mockFrom.mockClear()
    process.env.SUPABASE_URL = 'https://fake.supabase.co'
    process.env.SUPABASE_PUBLISHABLE_KEY = 'fake-publishable-key'
  })

  it("maps the arc's own server address", async () => {
    mockOrder.mockResolvedValue({
      data: [{ ...sampleArcRow, server_host: 'play.kinetic.example', server_port: 25570 }],
      error: null,
    })

    const { fetchArcsWithCache } = await import('./supabase')
    const [arc] = await fetchArcsWithCache()

    expect(arc).toMatchObject({ serverHost: 'play.kinetic.example', serverPort: 25570 })
  })

  it('maps a missing server address (columns not migrated yet) to null', async () => {
    mockOrder.mockResolvedValue({ data: [sampleArcRow], error: null })

    const { fetchArcsWithCache } = await import('./supabase')
    const [arc] = await fetchArcsWithCache()

    expect(arc).toMatchObject({ serverHost: null, serverPort: null })
  })

  it('resolves an arc from the local cache without querying Supabase', async () => {
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFileSync.mockReturnValue(
      JSON.stringify({
        fetchedAt: '2026-10-19T00:00:00Z',
        arcs: [{ slug: 'arcend-arc02', serverHost: 'play.kinetic.example', serverPort: 25570 }],
      })
    )

    const { getCachedRemoteArc } = await import('./supabase')

    expect(getCachedRemoteArc('arcend-arc02')).toMatchObject({ serverHost: 'play.kinetic.example' })
    expect(getCachedRemoteArc('unknown')).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
