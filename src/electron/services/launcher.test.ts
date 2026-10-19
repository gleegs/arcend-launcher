import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import path from 'node:path'

const mockGetMainWindow = vi.fn()
const mockHideWindow = vi.fn()
const mockRestoreWindow = vi.fn()

vi.mock('./window', () => ({
  getMainWindow: (...args: unknown[]) => mockGetMainWindow(...args),
  hideWindow: (...args: unknown[]) => mockHideWindow(...args),
  restoreWindow: (...args: unknown[]) => mockRestoreWindow(...args),
}))

const mockGetConfig = vi.fn()

vi.mock('./store', () => ({
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
}))

const mockAuthRefresh = vi.fn()
const mockDecryptToken = vi.fn()

vi.mock('./auth', () => ({
  auth: { refresh: (...args: unknown[]) => mockAuthRefresh(...args) },
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}))

const mockGetArcPath = vi.fn()
const mockGetArcRegistry = vi.fn()
const mockSyncArcModpack = vi.fn()

vi.mock('./arc', () => ({
  getArcPath: (...args: unknown[]) => mockGetArcPath(...args),
  getRegistry: (...args: unknown[]) => mockGetArcRegistry(...args),
  syncArcModpack: (...args: unknown[]) => mockSyncArcModpack(...args),
}))

const mockEnsureJava = vi.fn()
const mockGetJavaExecutable = vi.fn()

vi.mock('./java', () => ({
  ensureJava: (...args: unknown[]) => mockEnsureJava(...args),
  getJavaExecutable: (...args: unknown[]) => mockGetJavaExecutable(...args),
}))

const mockMigrateKeybinds = vi.fn()
const mockMigrateBlur = vi.fn()
const mockMigrateGraphics = vi.fn()

vi.mock('./keybindsMigration', () => ({
  migrateKeybinds: (...args: unknown[]) => mockMigrateKeybinds(...args),
}))
vi.mock('./blurMigration', () => ({
  migrateBlur: (...args: unknown[]) => mockMigrateBlur(...args),
}))
vi.mock('./graphicsMigration', () => ({
  migrateGraphics: (...args: unknown[]) => mockMigrateGraphics(...args),
}))

const {
  mockFsExistsSync,
  mockFsMkdirSync,
  mockFsCreateWriteStream,
  mockFsUnlinkSync,
  mockCryptoRandomBytes,
  mockCryptoRandomUUID,
  mockHttpsGet,
  mockHttpGet,
  mockLaunch,
  emitters,
  MockClientFn,
} = vi.hoisted(() => {
  const mockLaunch = vi.fn()
  const emitters: EventEmitter[] = []

  function MockClientFn(this: { on: EventEmitter['on']; launch: typeof mockLaunch }) {
    const emitter = new EventEmitter()
    emitters.push(emitter)
    this.on = emitter.on.bind(emitter)
    this.launch = mockLaunch
  }

  return {
    mockFsExistsSync: vi.fn(),
    mockFsMkdirSync: vi.fn(),
    mockFsCreateWriteStream: vi.fn(),
    mockFsUnlinkSync: vi.fn(),
    mockCryptoRandomBytes: vi.fn(),
    mockCryptoRandomUUID: vi.fn(),
    mockHttpsGet: vi.fn(),
    mockHttpGet: vi.fn(),
    mockLaunch,
    emitters,
    MockClientFn,
  }
})

vi.mock('node:fs', () => {
  const fns = {
    existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
    mkdirSync: (...args: unknown[]) => mockFsMkdirSync(...args),
    createWriteStream: (...args: unknown[]) => mockFsCreateWriteStream(...args),
    unlinkSync: (...args: unknown[]) => mockFsUnlinkSync(...args),
  }
  return { __esModule: true, default: fns, ...fns }
})

vi.mock('node:crypto', () => {
  const fns = {
    randomBytes: (...args: unknown[]) => mockCryptoRandomBytes(...args),
    randomUUID: (...args: unknown[]) => mockCryptoRandomUUID(...args),
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

vi.mock('minecraft-launcher-core', () => ({
  Client: MockClientFn,
}))

const sampleArcPath = '/fake/arcend/arcs/test-arc'
const sampleInstallation = {
  arcId: 'test-arc',
  path: sampleArcPath,
  installedAt: '2026-01-01',
  metadata: {
    arcId: 'test-arc',
    name: 'Test Arc',
    version: '1.0',
    packwizUrl: 'https://example.com/pack.toml',
    mcVersion: '1.20.1',
    javaVersion: '21',
  },
  size: 1024,
}

function getLatestEmitter(): EventEmitter {
  return emitters[emitters.length - 1]
}

function setupOnlineAuthMocks() {
  mockGetConfig.mockImplementation((key: string) => {
    if (key === 'encryptedRefreshToken') return 'encrypted-token-123'
    return undefined
  })
  mockDecryptToken.mockReturnValue('refresh-token-123')
  const mockMclcResult = {
    access_token: 'access-123',
    client_token: 'client-123',
    uuid: 'uuid-123',
    name: 'TestPlayer',
    user_properties: {},
    meta: { type: 'mojang', demo: false },
  }
  const mockMinecraft = {
    profile: { id: 'profile-id', name: 'TestPlayer' },
    mclc: vi.fn().mockReturnValue(mockMclcResult),
  }
  const mockXbox = {
    getMinecraft: vi.fn().mockResolvedValue(mockMinecraft),
  }
  mockAuthRefresh.mockResolvedValue(mockXbox)
}

function setupOfflineAuthMocks() {
  mockGetConfig.mockImplementation((key: string) => {
    if (key === 'cachedProfile') return { id: 'profile-id', name: 'TestPlayer' }
    return undefined
  })
  mockCryptoRandomBytes.mockReturnValue({
    toString: () => 'abcdef1234567890abcdef1234567890',
  })
  mockCryptoRandomUUID.mockReturnValue('uuid-mock-1234')
}

function setupArcMocks() {
  mockGetArcRegistry.mockReturnValue({
    installations: { 'test-arc': sampleInstallation },
  })
  mockGetArcPath.mockReturnValue(sampleArcPath)
  mockSyncArcModpack.mockResolvedValue(undefined)
  mockFsExistsSync.mockImplementation((p: string) => {
    if (p === path.join(sampleArcPath, 'minecraft')) return true
    return false
  })
}

function setupJavaMocks() {
  mockEnsureJava.mockResolvedValue({ version: '21', path: '/runtime/java-21' })
  mockGetJavaExecutable.mockReturnValue('/runtime/java-21/bin/java')
}

describe('launcher service', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetMainWindow.mockReset()
    mockHideWindow.mockReset()
    mockRestoreWindow.mockReset()
    mockGetConfig.mockReset()
    mockAuthRefresh.mockReset()
    mockDecryptToken.mockReset()
    mockGetArcPath.mockReset()
    mockGetArcRegistry.mockReset()
    mockSyncArcModpack.mockReset()
    mockEnsureJava.mockReset()
    mockGetJavaExecutable.mockReset()
    mockFsExistsSync.mockReset()
    mockFsMkdirSync.mockReset()
    mockFsCreateWriteStream.mockReset()
    mockFsUnlinkSync.mockReset()
    mockCryptoRandomBytes.mockReset()
    mockCryptoRandomUUID.mockReset()
    mockHttpsGet.mockReset()
    mockHttpGet.mockReset()
    mockLaunch.mockReset()
    mockMigrateKeybinds.mockReset().mockReturnValue({ status: 'skipped' })
    mockMigrateBlur.mockReset().mockReturnValue({ status: 'skipped' })
    mockMigrateGraphics.mockReset().mockReturnValue({ status: 'skipped', changed: [] })
    emitters.length = 0
    mockGetMainWindow.mockReturnValue(null)
  })

  describe('isGameRunning', () => {
    it('returns false when no game is running', async () => {
      const { isGameRunning } = await import('./launcher')
      expect(isGameRunning()).toBe(false)
    })

    it('returns true after launchGame starts', async () => {
      setupOnlineAuthMocks()
      setupArcMocks()
      setupJavaMocks()
      mockLaunch.mockReturnValue(new Promise(() => undefined))

      const { launchGame, isGameRunning } = await import('./launcher')
      launchGame({ arcId: 'test-arc', mode: 'online' }).catch(() => undefined)

      await vi.waitFor(() => {
        expect(isGameRunning()).toBe(true)
      })
    })
  })

  describe('launchGame — online mode', () => {
    it('completes full flow: validate arc, auth, launch, events, close', async () => {
      setupOnlineAuthMocks()
      setupArcMocks()
      setupJavaMocks()
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame, isGameRunning } = await import('./launcher')

      const launchPromise = launchGame({ arcId: 'test-arc', mode: 'online' })

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      expect(isGameRunning()).toBe(true)

      const launchOpts = mockLaunch.mock.calls[0][0]
      expect(launchOpts.version.number).toBe('1.20.1')
      expect(launchOpts.javaPath).toBe('/runtime/java-21/bin/java')
      expect(launchOpts.memory.max).toBe('4G')
      expect(launchOpts.memory.min).toBe('2G')

      const emitter = getLatestEmitter()
      emitter.emit('data', 'Setting user: TestPlayer')
      expect(mockHideWindow).toHaveBeenCalled()

      emitter.emit('close', 0)
      await launchPromise

      expect(isGameRunning()).toBe(false)
      expect(mockRestoreWindow).toHaveBeenCalled()
    })

    it('throws when a game is already running', async () => {
      setupOnlineAuthMocks()
      setupArcMocks()
      setupJavaMocks()
      mockLaunch.mockReturnValue(new Promise(() => undefined))

      const { launchGame } = await import('./launcher')
      launchGame({ arcId: 'test-arc', mode: 'online' }).catch(() => undefined)

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      await expect(launchGame({ arcId: 'test-arc', mode: 'online' })).rejects.toThrow(
        "Un jeu est déjà en cours d'exécution."
      )
    })

    it('throws when arc is not found in registry', async () => {
      setupOnlineAuthMocks()
      mockGetArcRegistry.mockReturnValue({ installations: {} })

      const { launchGame } = await import('./launcher')

      await expect(launchGame({ arcId: 'unknown-arc', mode: 'online' })).rejects.toThrow(
        'Arc "unknown-arc" n\'est pas installé.'
      )
    })

    it('throws when minecraft folder does not exist', async () => {
      setupOnlineAuthMocks()
      mockGetArcRegistry.mockReturnValue({
        installations: { 'test-arc': sampleInstallation },
      })
      mockGetArcPath.mockReturnValue(sampleArcPath)
      mockFsExistsSync.mockReturnValue(false)

      const { launchGame } = await import('./launcher')

      await expect(launchGame({ arcId: 'test-arc', mode: 'online' })).rejects.toThrow(
        'Dossier minecraft introuvable pour l\'arc "test-arc".'
      )
    })

    it('throws when mcVersion is missing from metadata', async () => {
      setupOnlineAuthMocks()
      const noMcVersion = {
        ...sampleInstallation,
        metadata: { ...sampleInstallation.metadata, mcVersion: '' },
      }
      mockGetArcRegistry.mockReturnValue({
        installations: { 'test-arc': noMcVersion },
      })
      mockGetArcPath.mockReturnValue(sampleArcPath)
      mockFsExistsSync.mockReturnValue(true)

      const { launchGame } = await import('./launcher')

      await expect(launchGame({ arcId: 'test-arc', mode: 'online' })).rejects.toThrow(
        'version Minecraft non disponible'
      )
    })

    it('throws when no encrypted refresh token', async () => {
      setupArcMocks()
      mockGetConfig.mockReturnValue(undefined)

      const { launchGame } = await import('./launcher')

      await expect(launchGame({ arcId: 'test-arc', mode: 'online' })).rejects.toThrow(
        "Erreur d'authentification"
      )
    })

    it('throws when decryptToken returns null', async () => {
      setupArcMocks()
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'encryptedRefreshToken') return 'some-token'
        return undefined
      })
      mockDecryptToken.mockReturnValue(null)

      const { launchGame } = await import('./launcher')

      await expect(launchGame({ arcId: 'test-arc', mode: 'online' })).rejects.toThrow(
        "Erreur d'authentification"
      )
    })

    it('throws when refresh fails', async () => {
      setupArcMocks()
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'encryptedRefreshToken') return 'some-token'
        return undefined
      })
      mockDecryptToken.mockReturnValue('refresh-token')
      mockAuthRefresh.mockRejectedValue(new Error('refresh failed'))

      const { launchGame } = await import('./launcher')

      await expect(launchGame({ arcId: 'test-arc', mode: 'online' })).rejects.toThrow(
        "Erreur d'authentification : refresh failed"
      )
    })

    it('throws when minecraft profile is null', async () => {
      setupArcMocks()
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'encryptedRefreshToken') return 'some-token'
        return undefined
      })
      mockDecryptToken.mockReturnValue('refresh-token')
      const mockMinecraft = { profile: null, mclc: vi.fn() }
      const mockXbox = { getMinecraft: vi.fn().mockResolvedValue(mockMinecraft) }
      mockAuthRefresh.mockResolvedValue(mockXbox)

      const { launchGame } = await import('./launcher')

      await expect(launchGame({ arcId: 'test-arc', mode: 'online' })).rejects.toThrow(
        "Erreur d'authentification"
      )
    })

    it('handles launcher launch error', async () => {
      setupOnlineAuthMocks()
      setupArcMocks()
      setupJavaMocks()
      mockLaunch.mockRejectedValue(new Error('launch crashed'))

      const { launchGame, isGameRunning } = await import('./launcher')

      await expect(launchGame({ arcId: 'test-arc', mode: 'online' })).rejects.toThrow(
        'Erreur lors du lancement : launch crashed'
      )

      expect(isGameRunning()).toBe(false)
      expect(mockRestoreWindow).toHaveBeenCalled()
    })

    it('uses custom memory settings', async () => {
      setupOnlineAuthMocks()
      setupArcMocks()
      setupJavaMocks()
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame } = await import('./launcher')

      const launchPromise = launchGame({
        arcId: 'test-arc',
        mode: 'online',
        maxMemory: '8G',
        minMemory: '4G',
      })

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      const launchOpts = mockLaunch.mock.calls[0][0]
      expect(launchOpts.memory.max).toBe('8G')
      expect(launchOpts.memory.min).toBe('4G')

      const emitter = getLatestEmitter()
      emitter.emit('close', 0)
      await launchPromise
    })

    it('sends progress events via mainWindow', async () => {
      const sentChannels: { channel: string; data: unknown }[] = []
      const mockWebContents = {
        send: (channel: string, data: unknown) => sentChannels.push({ channel, data }),
      }
      const mockWin = {
        isDestroyed: vi.fn().mockReturnValue(false),
        webContents: mockWebContents,
      }
      mockGetMainWindow.mockReturnValue(mockWin)
      setupOnlineAuthMocks()
      setupArcMocks()
      setupJavaMocks()
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame } = await import('./launcher')

      const launchPromise = launchGame({ arcId: 'test-arc', mode: 'online' })

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      expect(sentChannels.length).toBeGreaterThan(0)
      expect(sentChannels[0].channel).toBe('launch:onProgress')
      expect(sentChannels[0].data).toEqual({ status: 'validating_arc', percent: 0 })

      const emitter = getLatestEmitter()
      emitter.emit('data', 'Setting user: TestPlayer')
      emitter.emit('close', 0)
      await launchPromise
    })

    it('skips progress when window is destroyed', async () => {
      mockGetMainWindow.mockReturnValue({
        isDestroyed: () => true,
        webContents: { send: vi.fn() },
      })
      setupOnlineAuthMocks()
      setupArcMocks()
      setupJavaMocks()
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame } = await import('./launcher')

      const launchPromise = launchGame({ arcId: 'test-arc', mode: 'online' })

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      const emitter = getLatestEmitter()
      emitter.emit('close', 0)
      await launchPromise
    })
  })

  describe('launchGame — offline mode', () => {
    it('uses offline token when mode is offline', async () => {
      setupOfflineAuthMocks()
      setupArcMocks()
      setupJavaMocks()
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame } = await import('./launcher')

      const launchPromise = launchGame({ arcId: 'test-arc', mode: 'offline' })

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      const launchOpts = mockLaunch.mock.calls[0][0]
      expect(launchOpts.authorization.name).toBe('TestPlayer')
      expect(launchOpts.authorization.uuid).toBe('profileid')

      const emitter = getLatestEmitter()
      emitter.emit('close', 0)
      await launchPromise
    })

    it('throws when no cached profile for offline', async () => {
      setupArcMocks()
      mockGetConfig.mockReturnValue(undefined)

      const { launchGame } = await import('./launcher')

      await expect(launchGame({ arcId: 'test-arc', mode: 'offline' })).rejects.toThrow(
        "Erreur d'authentification"
      )
    })
  })

  describe('launchGame — mod loader', () => {
    it('downloads mod loader installer when not present', async () => {
      setupOnlineAuthMocks()
      setupJavaMocks()
      mockGetArcRegistry.mockReturnValue({
        installations: {
          'test-arc': {
            ...sampleInstallation,
            metadata: {
              ...sampleInstallation.metadata,
              modLoader: {
                type: 'forge',
                version: '47.1.0',
                installerUrl: 'https://example.com/forge-installer.jar',
              },
            },
          },
        },
      })
      mockGetArcPath.mockReturnValue(sampleArcPath)

      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === path.join(sampleArcPath, 'minecraft')) return true
        if (p.includes('installer.jar')) return false
        if (p === sampleArcPath) return true
        return false
      })

      const mockFile = {
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'finish') cb()
        }),
        close: vi.fn((cb: () => void) => cb()),
      }
      mockFsCreateWriteStream.mockReturnValue(mockFile)

      mockHttpsGet.mockImplementation((_url: string, callback: (res: unknown) => void) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: vi.fn(),
          pipe: vi.fn(),
        }
        callback(res)
        return { on: vi.fn() }
      })
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame } = await import('./launcher')

      const launchPromise = launchGame({ arcId: 'test-arc', mode: 'online' })

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      const launchOpts = mockLaunch.mock.calls[0][0]
      expect(launchOpts.forge).toContain('forge-47.1.0-installer.jar')

      const emitter = getLatestEmitter()
      emitter.emit('close', 0)
      await launchPromise
    })

    it('skips download when mod loader installer already exists', async () => {
      setupOnlineAuthMocks()
      setupJavaMocks()
      mockGetArcRegistry.mockReturnValue({
        installations: {
          'test-arc': {
            ...sampleInstallation,
            metadata: {
              ...sampleInstallation.metadata,
              modLoader: {
                type: 'forge',
                version: '47.1.0',
                installerUrl: 'https://example.com/forge-installer.jar',
              },
            },
          },
        },
      })
      mockGetArcPath.mockReturnValue(sampleArcPath)
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === path.join(sampleArcPath, 'minecraft')) return true
        if (p.includes('installer.jar')) return true
        return false
      })
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame } = await import('./launcher')

      const launchPromise = launchGame({ arcId: 'test-arc', mode: 'online' })

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      expect(mockHttpsGet).not.toHaveBeenCalled()

      const emitter = getLatestEmitter()
      emitter.emit('close', 0)
      await launchPromise
    })
  })

  describe('launchGame — Arc 01 option migrations', () => {
    async function launchAndClose(arcId: string) {
      mockGetArcRegistry.mockReturnValue({
        installations: { [arcId]: { ...sampleInstallation, arcId } },
      })
      setupOnlineAuthMocks()
      setupJavaMocks()
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame } = await import('./launcher')
      const launchPromise = launchGame({ arcId, mode: 'online' })
      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })
      getLatestEmitter().emit('close', 0)
      await launchPromise
    }

    beforeEach(() => {
      setupArcMocks()
    })

    it('runs the option migrations for the Arc 01 modpack', async () => {
      await launchAndClose('arcend-prologue')

      const mcPath = path.join(sampleArcPath, 'minecraft')
      expect(mockMigrateKeybinds).toHaveBeenCalledWith(mcPath)
      expect(mockMigrateBlur).toHaveBeenCalledWith(mcPath)
      expect(mockMigrateGraphics).toHaveBeenCalledWith(mcPath)
    })

    it('leaves the options of other modpacks untouched', async () => {
      await launchAndClose('arcend-arc02')

      expect(mockMigrateKeybinds).not.toHaveBeenCalled()
      expect(mockMigrateBlur).not.toHaveBeenCalled()
      expect(mockMigrateGraphics).not.toHaveBeenCalled()
    })
  })

  describe('launchGame — java defaults', () => {
    it('defaults to java 21 when javaVersion is not set', async () => {
      setupOnlineAuthMocks()
      setupJavaMocks()
      mockGetArcRegistry.mockReturnValue({
        installations: {
          'test-arc': {
            ...sampleInstallation,
            metadata: { ...sampleInstallation.metadata, javaVersion: undefined },
          },
        },
      })
      mockGetArcPath.mockReturnValue(sampleArcPath)
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === path.join(sampleArcPath, 'minecraft')) return true
        return false
      })
      mockLaunch.mockResolvedValue(undefined)

      const { launchGame } = await import('./launcher')

      const launchPromise = launchGame({ arcId: 'test-arc', mode: 'online' })

      await vi.waitFor(() => {
        expect(mockLaunch).toHaveBeenCalled()
      })

      expect(mockEnsureJava).toHaveBeenCalledWith('21')

      const emitter = getLatestEmitter()
      emitter.emit('close', 0)
      await launchPromise
    })
  })
})
