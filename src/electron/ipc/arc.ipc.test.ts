import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

const mockGetInstalledArcs = vi.fn()
const mockInstallArc = vi.fn()
const mockUninstallArc = vi.fn()
const mockIsInstalled = vi.fn()
const mockGetArcPath = vi.fn()
const mockFetchArcsWithCache = vi.fn()
const mockFetchActiveArc = vi.fn()
const mockFetchServerState = vi.fn()

vi.mock('../services/arc', () => ({
  getInstalledArcs: (...args: unknown[]) => mockGetInstalledArcs(...args),
  installArc: (...args: unknown[]) => mockInstallArc(...args),
  uninstallArc: (...args: unknown[]) => mockUninstallArc(...args),
  isInstalled: (...args: unknown[]) => mockIsInstalled(...args),
  getArcPath: (...args: unknown[]) => mockGetArcPath(...args),
}))

vi.mock('../services/supabase', () => ({
  fetchArcsWithCache: (...args: unknown[]) => mockFetchArcsWithCache(...args),
  fetchActiveArc: (...args: unknown[]) => mockFetchActiveArc(...args),
  fetchServerState: (...args: unknown[]) => mockFetchServerState(...args),
}))

vi.mock('../lib/paths', () => ({
  arcsDir: '/fake/arcend/arcs',
  arcRegistryPath: '/fake/arcend/config/arcs.json',
}))

describe('registerArcIpc', () => {
  beforeEach(async () => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockGetInstalledArcs.mockReset()
    mockInstallArc.mockReset()
    mockUninstallArc.mockReset()
    mockIsInstalled.mockReset()
    mockGetArcPath.mockReset()
    mockFetchArcsWithCache.mockReset()
    mockFetchActiveArc.mockReset()
    mockFetchServerState.mockReset()
    vi.resetModules()
    const { registerArcIpc } = await import('./arc.ipc')
    registerArcIpc()
  })

  it('registers exactly 8 arc channels', () => {
    expect(handlers['arc:getRegistry']).toBeDefined()
    expect(handlers['arc:install']).toBeDefined()
    expect(handlers['arc:uninstall']).toBeDefined()
    expect(handlers['arc:isInstalled']).toBeDefined()
    expect(handlers['arc:getPath']).toBeDefined()
    expect(handlers['arc:fetchRemote']).toBeDefined()
    expect(handlers['arc:fetchActive']).toBeDefined()
    expect(handlers['arc:fetchServerState']).toBeDefined()
    expect(Object.keys(handlers)).toHaveLength(8)
  })

  it('arc:getRegistry calls getInstalledArcs and returns { ok: true, data }', async () => {
    const arcs = [{ arcId: 'test-arc', path: '/arcs/test-arc' }]
    mockGetInstalledArcs.mockReturnValue(arcs)

    const result = await handlers['arc:getRegistry']()

    expect(mockGetInstalledArcs).toHaveBeenCalled()
    expect(result).toEqual({ ok: true, data: arcs })
  })

  it('arc:install calls installArc with typed arguments and returns { ok: true, data }', async () => {
    const metadata = {
      arcId: 'test-arc',
      name: 'Test',
      version: '1.0',
      packwizUrl: 'https://example.com/pack.toml',
      mcVersion: '1.20.1',
      javaVersion: '21',
    }
    const installation = {
      arcId: 'test-arc',
      path: '/arcs/test-arc',
      installedAt: '2026-01-01',
      metadata,
      size: 1024,
    }
    mockInstallArc.mockResolvedValue(installation)

    const result = await handlers['arc:install']({}, 'test-arc', metadata)

    expect(mockInstallArc).toHaveBeenCalledWith('test-arc', metadata)
    expect(result).toEqual({ ok: true, data: installation })
  })

  it('arc:uninstall calls uninstallArc with typed argument and returns { ok: true, data }', async () => {
    mockUninstallArc.mockResolvedValue(undefined)

    const result = await handlers['arc:uninstall']({}, 'test-arc')

    expect(mockUninstallArc).toHaveBeenCalledWith('test-arc')
    expect(result).toEqual({ ok: true, data: undefined })
  })

  it('arc:isInstalled calls isInstalled with typed argument and returns { ok: true, data }', async () => {
    mockIsInstalled.mockReturnValue(true)

    const result = await handlers['arc:isInstalled']({}, 'test-arc')

    expect(mockIsInstalled).toHaveBeenCalledWith('test-arc')
    expect(result).toEqual({ ok: true, data: true })
  })

  it('arc:getPath calls getArcPath with typed argument and returns { ok: true, data }', async () => {
    mockGetArcPath.mockReturnValue('/fake/arcend/arcs/test-arc')

    const result = await handlers['arc:getPath']({}, 'test-arc')

    expect(mockGetArcPath).toHaveBeenCalledWith('test-arc')
    expect(result).toEqual({ ok: true, data: '/fake/arcend/arcs/test-arc' })
  })

  it('arc:fetchRemote calls fetchArcsWithCache and returns { ok: true, data }', async () => {
    const remoteArcs = [{ slug: 'test-arc', name: 'Test' }]
    mockFetchArcsWithCache.mockResolvedValue(remoteArcs)

    const result = await handlers['arc:fetchRemote']()

    expect(mockFetchArcsWithCache).toHaveBeenCalled()
    expect(result).toEqual({ ok: true, data: remoteArcs })
  })

  it('arc:fetchActive calls fetchActiveArc and returns { ok: true, data }', async () => {
    const activeArc = { slug: 'active-arc', name: 'Active' }
    mockFetchActiveArc.mockResolvedValue(activeArc)

    const result = await handlers['arc:fetchActive']()

    expect(mockFetchActiveArc).toHaveBeenCalled()
    expect(result).toEqual({ ok: true, data: activeArc })
  })

  it('arc:fetchServerState calls fetchServerState with the slug and returns { ok: true, data }', async () => {
    const serverState = { arcSlug: 'test-arc', activeRelease: '2.3.2', updatedAt: '2026-10-01' }
    mockFetchServerState.mockResolvedValue(serverState)

    const result = await handlers['arc:fetchServerState']({}, 'test-arc')

    expect(mockFetchServerState).toHaveBeenCalledWith('test-arc')
    expect(result).toEqual({ ok: true, data: serverState })
  })

  it('returns { ok: false, error } when handler throws an Error', async () => {
    mockInstallArc.mockRejectedValue(new Error('install failed'))

    const result = await handlers['arc:install']({}, 'test-arc', {})

    expect(result).toEqual({ ok: false, error: 'install failed' })
  })

  it('returns { ok: false, error } with stringified non-Error', async () => {
    mockGetInstalledArcs.mockImplementation(() => {
      throw 'unexpected'
    })

    const result = await handlers['arc:getRegistry']()

    expect(result).toEqual({ ok: false, error: 'unexpected' })
  })
})
