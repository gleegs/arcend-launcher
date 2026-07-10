import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEncryptString = vi.fn()
const mockDecryptString = vi.fn()
const mockIsEncryptionAvailable = vi.fn()

const mockClearStorageData = vi.fn()

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    removeListener: vi.fn(),
    getPath: vi.fn(() => {
      throw new Error('no logs dir in tests')
    }),
  },
  session: {
    fromPartition: vi.fn(() => ({ clearStorageData: () => mockClearStorageData() })),
  },
  safeStorage: {
    encryptString: (...args: unknown[]) => mockEncryptString(...args),
    decryptString: (...args: unknown[]) => mockDecryptString(...args),
    isEncryptionAvailable: () => mockIsEncryptionAvailable(),
  },
}))

const mockAuthLaunch = vi.fn()
const mockAuthRefresh = vi.fn()

vi.mock('msmc', () => ({
  Auth: vi.fn(function () {
    return {
      launch: (...args: unknown[]) => mockAuthLaunch(...args),
      refresh: (...args: unknown[]) => mockAuthRefresh(...args),
    }
  }),
}))

const mockGetConfig = vi.fn()
const mockSetConfig = vi.fn()

vi.mock('./store', () => ({
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
  setConfig: (...args: unknown[]) => mockSetConfig(...args),
}))

const mockGetMainWindow = vi.fn()

vi.mock('./window', () => ({
  getMainWindow: () => mockGetMainWindow(),
}))

const fakeProfile = { id: 'uuid-123', name: 'Player1' }

describe('auth service', () => {
  beforeEach(() => {
    vi.resetModules()
    mockEncryptString.mockReset()
    mockDecryptString.mockReset()
    mockIsEncryptionAvailable.mockReset()
    mockAuthLaunch.mockReset()
    mockAuthRefresh.mockReset()
    mockGetConfig.mockReset()
    mockSetConfig.mockReset()
    mockGetMainWindow.mockReset()
  })

  describe('login', () => {
    it('launches msmc and returns online state', async () => {
      mockGetMainWindow.mockReturnValue(null)
      mockIsEncryptionAvailable.mockReturnValue(true)
      mockEncryptString.mockReturnValue(Buffer.from('encrypted'))
      mockAuthLaunch.mockResolvedValue({
        getMinecraft: vi.fn().mockResolvedValue({ profile: { id: 'uuid-123', name: 'Player1' } }),
        save: vi.fn().mockReturnValue('refresh-token-abc'),
      })

      const { login } = await import('./auth')
      const result = await login()

      expect(result).toEqual({ status: 'online', profile: fakeProfile })
      expect(mockAuthLaunch).toHaveBeenCalledWith('electron', {
        width: 500,
        height: 650,
        resizable: false,
        parent: undefined,
        webPreferences: { partition: 'msmc-login' },
      })
    })

    it('normalises the string errors thrown by msmc', async () => {
      mockGetMainWindow.mockReturnValue(null)
      mockAuthLaunch.mockRejectedValue('error.gui.closed')

      const { login } = await import('./auth')
      await expect(login()).rejects.toThrow(/error\.gui\.closed/)
    })

    it('normalises the { response, ts } errors thrown by msmc', async () => {
      mockGetMainWindow.mockReturnValue(null)
      mockAuthLaunch.mockRejectedValue({
        ts: 'error.auth.minecraft.login',
        response: { status: 403, statusText: 'Forbidden', text: async () => 'NOT_FOUND' },
      })

      const { login } = await import('./auth')
      // Avant : `String(error)` donnait "[object Object]".
      await expect(login()).rejects.toThrow(
        'error.auth.minecraft.login (HTTP 403 Forbidden — NOT_FOUND)'
      )
    })

    it('throws if no minecraft profile', async () => {
      mockGetMainWindow.mockReturnValue(null)
      mockAuthLaunch.mockResolvedValue({
        getMinecraft: vi.fn().mockResolvedValue({ profile: null }),
      })

      const { login } = await import('./auth')
      await expect(login()).rejects.toThrow('No Minecraft profile found')
    })
  })

  describe('logout', () => {
    it('clears session by setting config values to undefined', async () => {
      const { logout } = await import('./auth')
      await logout()

      expect(mockSetConfig).toHaveBeenCalledWith('encryptedRefreshToken', undefined)
      expect(mockSetConfig).toHaveBeenCalledWith('cachedProfile', undefined)
    })

    it('clears the Microsoft login cookies so the account can be switched', async () => {
      const { logout } = await import('./auth')
      await logout()

      expect(mockClearStorageData).toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('returns online when token refresh succeeds', async () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'cachedProfile') return fakeProfile
        if (key === 'encryptedRefreshToken') return 'enc-token'
        return undefined
      })
      mockIsEncryptionAvailable.mockReturnValue(true)
      mockDecryptString.mockReturnValue('decrypted-token')
      mockAuthRefresh.mockResolvedValue({
        getMinecraft: vi.fn().mockResolvedValue({ profile: { id: 'uuid-123', name: 'Player1' } }),
        save: vi.fn().mockReturnValue('new-refresh-token'),
      })
      mockEncryptString.mockReturnValue(Buffer.from('new-enc'))

      const { refresh } = await import('./auth')
      const result = await refresh()

      expect(result).toEqual({ status: 'online', profile: fakeProfile })
    })

    it('returns offline when no token but cached profile exists', async () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'cachedProfile') return fakeProfile
        if (key === 'encryptedRefreshToken') return undefined
        return undefined
      })

      const { refresh } = await import('./auth')
      const result = await refresh()

      expect(result).toEqual({ status: 'offline', profile: fakeProfile })
    })

    it('returns unauthenticated when nothing is available', async () => {
      mockGetConfig.mockReturnValue(undefined)
      mockIsEncryptionAvailable.mockReturnValue(false)

      const { refresh } = await import('./auth')
      const result = await refresh()

      expect(result).toEqual({ status: 'unauthenticated' })
    })

    it('returns offline when auth.refresh throws and cached profile exists', async () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'cachedProfile') return fakeProfile
        if (key === 'encryptedRefreshToken') return 'enc-token'
        return undefined
      })
      mockIsEncryptionAvailable.mockReturnValue(true)
      mockDecryptString.mockReturnValue('decrypted-token')
      mockAuthRefresh.mockRejectedValue(new Error('network error'))

      const { refresh } = await import('./auth')
      const result = await refresh()

      expect(result).toEqual({ status: 'offline', profile: fakeProfile })
    })

    it('returns unauthenticated when auth.refresh throws and no cache', async () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'cachedProfile') return undefined
        if (key === 'encryptedRefreshToken') return 'enc-token'
        return undefined
      })
      mockIsEncryptionAvailable.mockReturnValue(true)
      mockDecryptString.mockReturnValue('decrypted-token')
      mockAuthRefresh.mockRejectedValue(new Error('network error'))

      const { refresh } = await import('./auth')
      const result = await refresh()

      expect(result).toEqual({ status: 'unauthenticated' })
    })
  })

  describe('getAuthState', () => {
    it('returns online when token and profile exist', async () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'cachedProfile') return fakeProfile
        if (key === 'encryptedRefreshToken') return 'enc-token'
        return undefined
      })
      mockIsEncryptionAvailable.mockReturnValue(true)
      mockDecryptString.mockReturnValue('valid-token')

      const { getAuthState } = await import('./auth')
      const result = getAuthState()

      expect(result).toEqual({ status: 'online', profile: fakeProfile })
    })

    it('returns offline when profile exists but no valid token', async () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === 'cachedProfile') return fakeProfile
        if (key === 'encryptedRefreshToken') return undefined
        return undefined
      })
      mockIsEncryptionAvailable.mockReturnValue(false)

      const { getAuthState } = await import('./auth')
      const result = getAuthState()

      expect(result).toEqual({ status: 'offline', profile: fakeProfile })
    })

    it('returns unauthenticated when nothing exists', async () => {
      mockGetConfig.mockReturnValue(undefined)
      mockIsEncryptionAvailable.mockReturnValue(false)

      const { getAuthState } = await import('./auth')
      const result = getAuthState()

      expect(result).toEqual({ status: 'unauthenticated' })
    })
  })

  describe('encryptToken / decryptToken', () => {
    it('round-trips encrypt -> decrypt', async () => {
      const plainText = 'my-secret-token'
      const fakeEncrypted = Buffer.from('encrypted-bytes')

      mockEncryptString.mockReturnValue(fakeEncrypted)
      mockDecryptString.mockReturnValue(plainText)

      const { decryptToken } = await import('./auth')

      const encrypted = fakeEncrypted.toString('base64')
      const decrypted = decryptToken(encrypted)

      expect(mockDecryptString).toHaveBeenCalledWith(Buffer.from(encrypted, 'base64'))
      expect(decrypted).toBe(plainText)
    })

    it('decryptToken returns null on invalid input', async () => {
      mockDecryptString.mockImplementation(() => {
        throw new Error('decryption failed')
      })

      const { decryptToken } = await import('./auth')
      const result = decryptToken('invalid-base64!!!')

      expect(result).toBeNull()
    })
  })
})
