import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useModpackVersionStore, isModpackUpdatePending } from './modpackVersion'
import type { ArcInstallation } from '../../electron/types/arc'

const electronApi = vi.hoisted(() => ({
  arcFetchServerState: vi.fn(),
  arcGetRegistry: vi.fn(),
}))

// Le renderer accède au main process via window.electronAPI (preload).
vi.stubGlobal('electronAPI', electronApi)

function installation(version: string): ArcInstallation {
  return {
    arcId: 'arcend-prologue',
    path: '/arcs/arcend-prologue',
    installedAt: '2026-10-01T00:00:00Z',
    metadata: {
      arcId: 'arcend-prologue',
      name: 'Arcend Prologue',
      version,
      packwizUrl: 'https://arcend-modpacks.s3.gra.io.cloud.ovh.net/arc01/releases/pack.toml',
      mcVersion: '1.21.1',
      javaVersion: '21',
    },
    size: 1024,
  }
}

describe('isModpackUpdatePending', () => {
  it('is pending when installed and releases differ', () => {
    expect(
      isModpackUpdatePending({ installed: true, serverRelease: '2.3.3', installedRelease: '2.3.2' })
    ).toBe(true)
  })

  it('is not pending when releases match', () => {
    expect(
      isModpackUpdatePending({ installed: true, serverRelease: '2.3.2', installedRelease: '2.3.2' })
    ).toBe(false)
  })

  it('is not pending when not installed or server release unknown', () => {
    expect(
      isModpackUpdatePending({ installed: false, serverRelease: '2.3.3', installedRelease: null })
    ).toBe(false)
    expect(
      isModpackUpdatePending({ installed: true, serverRelease: null, installedRelease: '2.3.2' })
    ).toBe(false)
  })
})

describe('useModpackVersionStore.refresh', () => {
  beforeEach(() => {
    useModpackVersionStore.setState({
      serverRelease: null,
      installedRelease: null,
      installed: false,
    })
    electronApi.arcFetchServerState.mockReset()
    electronApi.arcGetRegistry.mockReset()
  })

  it('fills server release and installed version from IPC', async () => {
    electronApi.arcFetchServerState.mockResolvedValue({
      ok: true,
      data: {
        arcSlug: 'arcend-prologue',
        activeRelease: '2.3.2',
        updatedAt: '2026-10-01T05:00:00Z',
      },
    })
    electronApi.arcGetRegistry.mockResolvedValue({
      ok: true,
      data: [installation('2.3.2')],
    })

    await useModpackVersionStore.getState().refresh('arcend-prologue')

    expect(useModpackVersionStore.getState().serverRelease).toBe('2.3.2')
    expect(useModpackVersionStore.getState().installedRelease).toBe('2.3.2')
    expect(useModpackVersionStore.getState().installed).toBe(true)
  })

  it('reports an update pending when local is older than server', async () => {
    electronApi.arcFetchServerState.mockResolvedValue({
      ok: true,
      data: {
        arcSlug: 'arcend-prologue',
        activeRelease: '2.3.3',
        updatedAt: '2026-10-02T05:00:00Z',
      },
    })
    electronApi.arcGetRegistry.mockResolvedValue({
      ok: true,
      data: [installation('2.3.2')],
    })

    await useModpackVersionStore.getState().refresh('arcend-prologue')

    const state = useModpackVersionStore.getState()
    expect(isModpackUpdatePending(state)).toBe(true)
  })

  it('tolerates absent server state (unknown arc) and missing installation', async () => {
    electronApi.arcFetchServerState.mockResolvedValue({ ok: true, data: null })
    electronApi.arcGetRegistry.mockResolvedValue({ ok: true, data: [] })

    await useModpackVersionStore.getState().refresh('arcend-prologue')

    expect(useModpackVersionStore.getState().serverRelease).toBeNull()
    expect(useModpackVersionStore.getState().installedRelease).toBeNull()
    expect(useModpackVersionStore.getState().installed).toBe(false)
  })

  it('degrades gracefully when IPC fails', async () => {
    electronApi.arcFetchServerState.mockRejectedValue(new Error('ipc down'))
    electronApi.arcGetRegistry.mockRejectedValue(new Error('ipc down'))

    await expect(
      useModpackVersionStore.getState().refresh('arcend-prologue')
    ).resolves.toBeUndefined()
    expect(useModpackVersionStore.getState().serverRelease).toBeNull()
  })
})
