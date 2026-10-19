import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

const mockFetchServerStatus = vi.fn()

vi.mock('../services/server', () => ({
  fetchServerStatus: (...args: unknown[]) => mockFetchServerStatus(...args),
}))

const mockGetCachedRemoteArc = vi.fn()

vi.mock('../services/supabase', () => ({
  getCachedRemoteArc: (...args: unknown[]) => mockGetCachedRemoteArc(...args),
}))

describe('registerServerIpc', () => {
  beforeEach(async () => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockFetchServerStatus.mockReset()
    mockGetCachedRemoteArc.mockReset()
    vi.resetModules()
    const { registerServerIpc } = await import('./server.ipc')
    registerServerIpc()
  })

  it('registers the server:fetchStatus channel', () => {
    expect(handlers['server:fetchStatus']).toBeDefined()
    expect(Object.keys(handlers)).toHaveLength(1)
  })

  it('returns the server status', async () => {
    mockFetchServerStatus.mockResolvedValue({ online: true, players: 19, maxPlayers: 100 })

    const result = await handlers['server:fetchStatus']()

    expect(mockFetchServerStatus).toHaveBeenCalledOnce()
    expect(mockFetchServerStatus).toHaveBeenCalledWith(null)
    expect(result).toEqual({ ok: true, data: { online: true, players: 19, maxPlayers: 100 } })
  })

  it('queries the server of the selected arc', async () => {
    mockGetCachedRemoteArc.mockReturnValue({
      slug: 'arcend-arc02',
      serverHost: 'play.kinetic.example',
      serverPort: 25570,
    })
    mockFetchServerStatus.mockResolvedValue({ online: true, players: 2, maxPlayers: 20 })

    await handlers['server:fetchStatus']({}, 'arcend-arc02')

    expect(mockGetCachedRemoteArc).toHaveBeenCalledWith('arcend-arc02')
    expect(mockFetchServerStatus).toHaveBeenCalledWith({
      host: 'play.kinetic.example',
      port: 25570,
    })
  })

  it('falls back to the default server for an unknown arc', async () => {
    mockGetCachedRemoteArc.mockReturnValue(null)
    mockFetchServerStatus.mockResolvedValue({ online: false, players: 0, maxPlayers: 0 })

    await handlers['server:fetchStatus']({}, 'unknown-arc')

    expect(mockFetchServerStatus).toHaveBeenCalledWith(null)
  })
})
