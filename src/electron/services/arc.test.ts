import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

const fakeArcsDir = '/fake/arcend/arcs'
const fakeConfigDir = '/fake/arcend/config'
const fakeArcRegistryPath = path.join(fakeConfigDir, 'arcs.json')

vi.mock('../lib/paths', () => ({
  arcsDir: fakeArcsDir,
  arcRegistryPath: fakeArcRegistryPath,
}))

const mockGetMainWindow = vi.fn()

vi.mock('./window', () => ({
  getMainWindow: () => mockGetMainWindow(),
}))

const mockEnsurePackwiz = vi.fn()
const mockGetJarPath = vi.fn()

vi.mock('./packwiz', () => ({
  ensurePackwiz: (...args: unknown[]) => mockEnsurePackwiz(...args),
  getJarPath: (...args: unknown[]) => mockGetJarPath(...args),
}))

const mockEnsureJava = vi.fn()
const mockGetJavaExecutable = vi.fn()

vi.mock('./java', () => ({
  ensureJava: (...args: unknown[]) => mockEnsureJava(...args),
  getJavaExecutable: (...args: unknown[]) => mockGetJavaExecutable(...args),
}))

const {
  mockFsExistsSync,
  mockFsReadFileSync,
  mockFsWriteFileSync,
  mockFsMkdirSync,
  mockFsRmSync,
  mockFsReaddirSync,
  mockFsStatSync,
  mockFsPromisesReaddir,
  mockFsPromisesStat,
  mockFsPromisesRm,
  mockSpawn,
  mockHttpsGet,
  mockHttpGet,
} = vi.hoisted(() => ({
  mockFsExistsSync: vi.fn(),
  mockFsReadFileSync: vi.fn(),
  mockFsWriteFileSync: vi.fn(),
  mockFsMkdirSync: vi.fn(),
  mockFsRmSync: vi.fn(),
  mockFsReaddirSync: vi.fn(),
  mockFsStatSync: vi.fn(),
  mockFsPromisesReaddir: vi.fn(),
  mockFsPromisesStat: vi.fn(),
  mockFsPromisesRm: vi.fn(),
  mockSpawn: vi.fn(),
  mockHttpsGet: vi.fn(),
  mockHttpGet: vi.fn(),
}))

const { mockApp } = vi.hoisted(() => ({
  mockApp: { isPackaged: false },
}))

vi.mock('node:fs', () => {
  const fns = {
    existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockFsReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockFsWriteFileSync(...args),
    mkdirSync: (...args: unknown[]) => mockFsMkdirSync(...args),
    rmSync: (...args: unknown[]) => mockFsRmSync(...args),
    readdirSync: (...args: unknown[]) => mockFsReaddirSync(...args),
    statSync: (...args: unknown[]) => mockFsStatSync(...args),
    promises: {
      readdir: (...args: unknown[]) => mockFsPromisesReaddir(...args),
      stat: (...args: unknown[]) => mockFsPromisesStat(...args),
      rm: (...args: unknown[]) => mockFsPromisesRm(...args),
    },
  }
  return { __esModule: true, default: fns, ...fns }
})

vi.mock('node:child_process', () => {
  const fns = {
    spawn: (...args: unknown[]) => mockSpawn(...args),
  }
  return { __esModule: true, default: fns, ...fns }
})

vi.mock('node:https', () => {
  const fns = {
    get: (...args: unknown[]) => mockHttpsGet(...args),
  }
  return { __esModule: true, default: fns, ...fns }
})

vi.mock('node:http', () => {
  const fns = {
    get: (...args: unknown[]) => mockHttpGet(...args),
  }
  return { __esModule: true, default: fns, ...fns }
})

vi.mock('electron', () => ({
  app: mockApp,
}))

const sampleMetadata = {
  arcId: 'test-arc',
  name: 'Test Arc',
  version: '1.0',
  packwizUrl: 'https://example.com/pack.toml',
  mcVersion: '1.20.1',
  javaVersion: '21',
}

function setupSpawnExit(code: number, options?: { stderr?: string }) {
  mockSpawn.mockImplementation(() => ({
    stdout: { on: vi.fn() },
    stderr: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data' && options?.stderr) cb(Buffer.from(options.stderr))
      }),
    },
    on: vi.fn((event: string, cb: (c: number | null) => void) => {
      if (event === 'close') setTimeout(() => cb(code), 0)
    }),
  }))
}

/**
 * Variante de setupSpawnExit qui émet des chunks stdout (pour tester le parsing
 * de la granularité mods pendant la phase syncing_packwiz).
 */
function setupSpawnWithStdout(code: number, stdoutChunks: string[]) {
  mockSpawn.mockImplementation(() => ({
    stdout: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          for (const chunk of stdoutChunks) cb(Buffer.from(chunk))
        }
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (c: number | null) => void) => {
      if (event === 'close') setTimeout(() => cb(code), 0)
    }),
  }))
}

/**
 * Fait échouer les `failCount` premiers spawns packwiz (code de sortie + stderr
 * réseau), puis réussit. Sert à tester le retry sur timeouts transitoires.
 */
function setupSpawnFailThenSucceed(failCount: number, stderr: string) {
  let call = 0
  mockSpawn.mockImplementation(() => {
    const code = call < failCount ? 1 : 0
    const emitStderr = call < failCount
    call++
    return {
      stdout: { on: vi.fn() },
      stderr: {
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data' && emitStderr) cb(Buffer.from(stderr))
        }),
      },
      on: vi.fn((event: string, cb: (c: number | null) => void) => {
        if (event === 'close') setTimeout(() => cb(code), 0)
      }),
    }
  })
}

function mockHttpResponse(options: {
  statusCode?: number
  headers?: Record<string, string>
  data?: string
}) {
  return (_url: string, callback: (res: unknown) => void) => {
    const res = {
      statusCode: options.statusCode ?? 200,
      headers: options.headers ?? {},
      on: vi.fn((event: string, cb: (chunk?: string) => void) => {
        if (event === 'data' && options.data) cb(options.data)
        if (event === 'end') cb()
      }),
    }
    callback(res)
    return { on: vi.fn() }
  }
}

describe('arc service', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFsExistsSync.mockReset()
    mockFsReadFileSync.mockReset()
    mockFsWriteFileSync.mockReset()
    mockFsMkdirSync.mockReset()
    mockFsRmSync.mockReset()
    mockFsReaddirSync.mockReset()
    mockFsStatSync.mockReset()
    mockFsPromisesReaddir.mockReset().mockResolvedValue([])
    mockFsPromisesStat.mockReset().mockResolvedValue({ size: 0 })
    mockFsPromisesRm.mockReset().mockResolvedValue(undefined)
    mockSpawn.mockReset()
    mockHttpsGet.mockReset()
    mockHttpGet.mockReset()
    mockGetMainWindow.mockReset()
    mockEnsurePackwiz.mockReset()
    mockGetJarPath.mockReset()
    mockEnsureJava.mockReset()
    mockGetJavaExecutable.mockReset()
    mockGetMainWindow.mockReturnValue(null)
    mockApp.isPackaged = false
    delete process.env.ARCEND_PACK_TOML_URL
  })

  describe('getRegistry', () => {
    it('returns empty registry when file does not exist', async () => {
      mockFsExistsSync.mockReturnValue(false)

      const { getRegistry } = await import('./arc')
      const result = getRegistry()

      expect(result).toEqual({ installations: {} })
    })

    it('returns parsed registry when file exists', async () => {
      mockFsExistsSync.mockReturnValue(true)
      const registry = {
        installations: {
          'test-arc': {
            arcId: 'test-arc',
            path: '/arcs/test-arc',
            installedAt: '2026-01-01',
            metadata: sampleMetadata,
            size: 1024,
          },
        },
      }
      mockFsReadFileSync.mockReturnValue(JSON.stringify(registry))

      const { getRegistry } = await import('./arc')
      const result = getRegistry()

      expect(result).toEqual(registry)
    })

    it('returns empty registry when file is corrupted', async () => {
      mockFsExistsSync.mockReturnValue(true)
      mockFsReadFileSync.mockReturnValue('not json{{{')

      const { getRegistry } = await import('./arc')
      const result = getRegistry()

      expect(result).toEqual({ installations: {} })
    })
  })

  describe('getInstalledArcs', () => {
    it('returns installations that exist on filesystem', async () => {
      mockFsExistsSync.mockReturnValue(true)
      const registry = {
        installations: {
          'arc-1': {
            arcId: 'arc-1',
            path: '/arcs/arc-1',
            installedAt: '2026-01-01',
            metadata: sampleMetadata,
            size: 100,
          },
          'arc-2': {
            arcId: 'arc-2',
            path: '/arcs/arc-2',
            installedAt: '2026-01-02',
            metadata: sampleMetadata,
            size: 200,
          },
        },
      }
      mockFsReadFileSync.mockReturnValue(JSON.stringify(registry))

      const { getInstalledArcs } = await import('./arc')
      const result = getInstalledArcs()

      expect(result).toHaveLength(2)
      expect(result[0].arcId).toBe('arc-1')
      expect(result[1].arcId).toBe('arc-2')
    })

    it('filters out installations whose path does not exist', async () => {
      let callCount = 0
      mockFsExistsSync.mockImplementation(() => {
        callCount++
        return callCount <= 2
      })
      const registry = {
        installations: {
          'arc-1': {
            arcId: 'arc-1',
            path: '/arcs/arc-1',
            installedAt: '2026-01-01',
            metadata: sampleMetadata,
            size: 100,
          },
          'arc-2': {
            arcId: 'arc-2',
            path: '/arcs/arc-2',
            installedAt: '2026-01-02',
            metadata: sampleMetadata,
            size: 200,
          },
        },
      }
      mockFsReadFileSync.mockReturnValue(JSON.stringify(registry))

      const { getInstalledArcs } = await import('./arc')
      const result = getInstalledArcs()

      expect(result).toHaveLength(1)
      expect(result[0].arcId).toBe('arc-1')
    })
  })

  describe('isInstalled', () => {
    it('returns true when in registry and path exists', async () => {
      mockFsExistsSync.mockReturnValue(true)
      mockFsReadFileSync.mockReturnValue(
        JSON.stringify({
          installations: {
            'test-arc': {
              arcId: 'test-arc',
              path: '/arcs/test-arc',
              installedAt: '2026-01-01',
              metadata: sampleMetadata,
              size: 1024,
            },
          },
        })
      )

      const { isInstalled } = await import('./arc')
      expect(isInstalled('test-arc')).toBe(true)
    })

    it('returns false when not in registry', async () => {
      mockFsExistsSync.mockReturnValue(false)

      const { isInstalled } = await import('./arc')
      expect(isInstalled('unknown-arc')).toBe(false)
    })

    it('returns false when in registry but path does not exist', async () => {
      let callCount = 0
      mockFsExistsSync.mockImplementation(() => {
        callCount++
        return callCount === 1
      })
      mockFsReadFileSync.mockReturnValue(
        JSON.stringify({
          installations: {
            'test-arc': {
              arcId: 'test-arc',
              path: '/arcs/test-arc',
              installedAt: '2026-01-01',
              metadata: sampleMetadata,
              size: 1024,
            },
          },
        })
      )

      const { isInstalled } = await import('./arc')
      expect(isInstalled('test-arc')).toBe(false)
    })
  })

  describe('getArcPath', () => {
    it('returns correct path for an arc', async () => {
      const { getArcPath } = await import('./arc')
      expect(getArcPath('my-arc')).toBe(path.join(fakeArcsDir, 'my-arc'))
    })
  })

  describe('installArc', () => {
    it('completes full install flow', async () => {
      setupSpawnExit(0)
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const { installArc } = await import('./arc')
      const result = await installArc('test-arc', sampleMetadata)

      expect(result.arcId).toBe('test-arc')
      expect(result.path).toBe(path.join(fakeArcsDir, 'test-arc'))
      expect(result.metadata.mcVersion).toBe('1.20.1')
      expect(mockEnsurePackwiz).toHaveBeenCalled()
      expect(mockEnsureJava).toHaveBeenCalledWith('21')
      expect(mockSpawn).toHaveBeenCalled()
      expect(mockFsWriteFileSync).toHaveBeenCalled()
      expect(mockFsMkdirSync).toHaveBeenCalled()
    })

    it('resolves mcVersion from pack.toml when missing', async () => {
      setupSpawnExit(0)
      mockHttpsGet.mockImplementation(mockHttpResponse({ data: 'minecraft = "1.21.4"' }))
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const metadataNoVersion = { ...sampleMetadata, mcVersion: '' }
      const { installArc } = await import('./arc')
      const result = await installArc('test-arc', metadataNoVersion)

      expect(result.metadata.mcVersion).toBe('1.21.4')
      expect(mockHttpsGet).toHaveBeenCalledWith(
        'https://example.com/pack.toml',
        expect.any(Function)
      )
    })

    it('rejects when pack.toml has no minecraft version', async () => {
      mockHttpsGet.mockImplementation(
        mockHttpResponse({ data: 'name = "some-pack"\nauthor = "test"' })
      )
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        if (p.includes('test-arc')) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })

      const metadataNoVersion = { ...sampleMetadata, mcVersion: '' }
      const { installArc } = await import('./arc')

      await expect(installArc('test-arc', metadataNoVersion)).rejects.toThrow(
        'Version Minecraft non trouvée dans pack.toml'
      )
    })

    it('handles HTTP error during mcVersion resolution', async () => {
      mockHttpsGet.mockImplementation(mockHttpResponse({ statusCode: 404 }))
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        if (p.includes('test-arc')) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })

      const metadataNoVersion = { ...sampleMetadata, mcVersion: '' }
      const { installArc } = await import('./arc')

      await expect(installArc('test-arc', metadataNoVersion)).rejects.toThrow(
        'HTTP 404 pour https://example.com/pack.toml'
      )
    })

    it('follows HTTP redirect during mcVersion resolution', async () => {
      setupSpawnExit(0)
      let callCount = 0
      mockHttpsGet.mockImplementation((_url: string, callback: (res: unknown) => void) => {
        callCount++
        if (callCount === 1) {
          const res = {
            statusCode: 301,
            headers: { location: 'https://cdn.example.com/pack.toml' },
            on: vi.fn(),
          }
          callback(res)
          return { on: vi.fn() }
        }
        const res = {
          statusCode: 200,
          headers: {},
          on: vi.fn((event: string, cb: (chunk?: string) => void) => {
            if (event === 'data') cb('minecraft = "1.20.4"')
            if (event === 'end') cb()
          }),
        }
        callback(res)
        return { on: vi.fn() }
      })
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const metadataNoVersion = { ...sampleMetadata, mcVersion: '' }
      const { installArc } = await import('./arc')
      const result = await installArc('test-arc', metadataNoVersion)

      expect(result.metadata.mcVersion).toBe('1.20.4')
      expect(mockHttpsGet).toHaveBeenCalledTimes(2)
    })

    it('cleans up on spawn failure', async () => {
      setupSpawnExit(1, { stderr: 'packwiz error' })
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        if (p.includes('test-arc')) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const { installArc } = await import('./arc')
      await expect(installArc('test-arc', sampleMetadata)).rejects.toThrow(
        /Packwiz failed with code 1/
      )

      expect(mockFsRmSync).toHaveBeenCalled()
    })

    it('retries packwiz on transient network timeout then succeeds', async () => {
      // 2 échecs réseau puis succès : le retry doit rattraper l'install.
      setupSpawnFailThenSucceed(2, 'java.net.SocketTimeoutException: timeout')
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const { installArc } = await import('./arc')
      const result = await installArc('test-arc', sampleMetadata)

      expect(result.arcId).toBe('test-arc')
      expect(mockSpawn).toHaveBeenCalledTimes(3)
    })

    it('does not retry non-network packwiz failures', async () => {
      setupSpawnExit(1, { stderr: 'pack.toml: invalid TOML syntax' })
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        if (p.includes('test-arc')) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const { installArc } = await import('./arc')
      await expect(installArc('test-arc', sampleMetadata)).rejects.toThrow(/invalid TOML/)

      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('emits mod download progress during packwiz sync', async () => {
      setupSpawnWithStdout(0, [
        'Starting packwiz installer\n',
        '(1/3) sodium.jar already exists (cached)\n',
        '(2/3) fabric-api.jar downloaded\n',
        '(3/3) optigui.jar downloaded\n',
      ])
      const send = vi.fn()
      mockGetMainWindow.mockReturnValue({ isDestroyed: () => false, webContents: { send } })
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const { installArc } = await import('./arc')
      await installArc('test-arc', sampleMetadata)

      // On filtre les appels send sur le canal de progression Arc
      const arcProgressCalls = send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'arc:onInstallProgress'
      )
      const payloads = arcProgressCalls.map((c: unknown[]) => c[1] as Record<string, unknown>)

      // Événement initial à 25% avec modsDownloaded: 0
      const syncEvents = payloads.filter((p) => p.status === 'syncing_packwiz')
      expect(syncEvents[0]).toMatchObject({ percent: 25, modsDownloaded: 0 })

      // Événements intermédiaires linéaires : chaque (x/y) incrémente le percent
      const modEvents = syncEvents.filter((p) => Number(p.modsDownloaded ?? 0) > 0)
      expect(modEvents.length).toBe(3)

      // (1/3) → 25 + floor(1/3 * 50) = 25 + 16 = 41
      expect(modEvents[0]).toMatchObject({ percent: 41, modsDownloaded: 1, modsTotal: 3 })
      // (2/3) → 25 + floor(2/3 * 50) = 25 + 33 = 58
      expect(modEvents[1]).toMatchObject({ percent: 58, modsDownloaded: 2, modsTotal: 3 })
      // (3/3) → 25 + floor(3/3 * 50) = 25 + 50 = 75
      expect(modEvents[2]).toMatchObject({ percent: 75, modsDownloaded: 3, modsTotal: 3 })
    })

    it('ensures Java before emitting creating_folder event', async () => {
      setupSpawnWithStdout(0, [])
      const send = vi.fn()
      mockGetMainWindow.mockReturnValue({ isDestroyed: () => false, webContents: { send } })
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      // Tracker l'ordre d'appel entre ensureJava, ensurePackwiz et le send Arc
      const callOrder: string[] = []
      mockEnsureJava.mockImplementationOnce(async () => {
        callOrder.push('ensureJava')
        return {
          version: '21',
          path: '/runtime/java-21',
          installedAt: '2026-01-01',
          arch: 'x64',
        }
      })
      mockEnsurePackwiz.mockImplementationOnce(async () => {
        callOrder.push('ensurePackwiz')
        return {
          version: '0.0.3',
          jarPath: '/runtime/packwiz.jar',
          installedAt: '2026-01-01',
        }
      })
      mockGetMainWindow.mockReturnValue({
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: { status: string }) => {
            if (channel === 'arc:onInstallProgress') {
              callOrder.push(`arc:${payload.status}`)
            }
          },
        },
      })

      const { installArc } = await import('./arc')
      await installArc('test-arc', sampleMetadata)

      // L'ordre doit suivre les plages du renderer :
      //   ensureJava (plage [0,40]) → ensurePackwiz (plage [40,50]) → Arc
      const javaIdx = callOrder.indexOf('ensureJava')
      const packwizIdx = callOrder.indexOf('ensurePackwiz')
      const folderIdx = callOrder.indexOf('arc:creating_folder')
      expect(javaIdx).toBeGreaterThanOrEqual(0)
      expect(packwizIdx).toBeGreaterThanOrEqual(0)
      expect(folderIdx).toBeGreaterThanOrEqual(0)
      expect(javaIdx).toBeLessThan(packwizIdx)
      expect(packwizIdx).toBeLessThan(folderIdx)
    })

    it('uses ARCEND_PACK_TOML_URL override in dev mode', async () => {
      setupSpawnExit(0)
      const overrideUrl = 'http://localhost:8080/pack.toml'
      process.env.ARCEND_PACK_TOML_URL = overrideUrl
      mockApp.isPackaged = false
      mockHttpGet.mockImplementation(mockHttpResponse({ data: 'minecraft = "1.20.1"' }))
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const metadataNoVersion = { ...sampleMetadata, mcVersion: '' }
      const { installArc } = await import('./arc')
      const result = await installArc('test-arc', metadataNoVersion)

      // Version résolue depuis le pack.toml local servi par `packwiz serve`
      expect(result.metadata.mcVersion).toBe('1.20.1')
      expect(mockHttpGet).toHaveBeenCalledWith(overrideUrl, expect.any(Function))
      expect(mockHttpsGet).not.toHaveBeenCalled()

      // packwiz spawné avec l'URL d'override comme source
      expect(mockSpawn).toHaveBeenCalled()
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      expect(spawnArgs[spawnArgs.length - 1]).toBe(overrideUrl)
    })

    it('ignores ARCEND_PACK_TOML_URL override in packaged build', async () => {
      setupSpawnExit(0)
      process.env.ARCEND_PACK_TOML_URL = 'http://localhost:8080/pack.toml'
      mockApp.isPackaged = true
      mockHttpsGet.mockImplementation(mockHttpResponse({ data: 'minecraft = "1.20.1"' }))
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcsDir) return true
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return JSON.stringify({ installations: {} })
        return ''
      })
      mockFsReaddirSync.mockReturnValue([])
      mockEnsurePackwiz.mockResolvedValue({
        version: '0.0.3',
        jarPath: '/runtime/packwiz.jar',
        installedAt: '2026-01-01',
      })
      mockGetJarPath.mockReturnValue('/runtime/packwiz.jar')
      mockEnsureJava.mockResolvedValue({
        version: '21',
        path: '/runtime/java-21',
        installedAt: '2026-01-01',
        arch: 'x64',
      })
      mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')

      const metadataNoVersion = { ...sampleMetadata, mcVersion: '' }
      const { installArc } = await import('./arc')
      await installArc('test-arc', metadataNoVersion)

      // L'URL distante d'origine est utilisée, l'override est ignoré.
      expect(mockHttpsGet).toHaveBeenCalledWith(
        'https://example.com/pack.toml',
        expect.any(Function)
      )
      expect(mockHttpGet).not.toHaveBeenCalled()
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      expect(spawnArgs[spawnArgs.length - 1]).toBe('https://example.com/pack.toml')
    })
  })

  describe('uninstallArc', () => {
    it('removes files and registry entry', async () => {
      const installation = {
        arcId: 'test-arc',
        path: path.join(fakeArcsDir, 'test-arc'),
        installedAt: '2026-01-01',
        metadata: sampleMetadata,
        size: 1024,
      }
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath) return true
        if (p === fakeConfigDir) return true
        if (p === path.join(fakeArcsDir, 'test-arc')) return true
        return false
      })
      mockFsReadFileSync.mockImplementation((p: string) => {
        if (p === fakeArcRegistryPath)
          return JSON.stringify({ installations: { 'test-arc': installation } })
        return ''
      })

      const { uninstallArc } = await import('./arc')
      uninstallArc('test-arc')

      expect(mockFsRmSync).toHaveBeenCalledWith(path.join(fakeArcsDir, 'test-arc'), {
        recursive: true,
        force: true,
      })
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        fakeArcRegistryPath,
        expect.any(String),
        'utf-8'
      )
      const registryCall = mockFsWriteFileSync.mock.calls.find(
        (call: unknown[]) => call[0] === fakeArcRegistryPath
      )
      const savedData = JSON.parse(registryCall?.[1] as string)
      expect(savedData.installations).not.toHaveProperty('test-arc')
    })

    it('throws when arc is not installed', async () => {
      mockFsExistsSync.mockReturnValue(false)

      const { uninstallArc } = await import('./arc')

      expect(() => uninstallArc('unknown-arc')).toThrow('Arc unknown-arc is not installed')
    })
  })
})
