import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockApp, mockWindowOptions } = vi.hoisted(() => ({
  mockApp: { isPackaged: false },
  mockWindowOptions: { current: undefined as unknown },
}))

const eventHandlers: Record<string, (...args: unknown[]) => void> = {}

const mockMinimize = vi.fn()
const mockMaximize = vi.fn()
const mockUnmaximize = vi.fn()
const mockClose = vi.fn()
const mockHide = vi.fn()
const mockShow = vi.fn()
const mockFocus = vi.fn()
const mockGetPosition = vi.fn()
const mockGetSize = vi.fn()
const mockSetBounds = vi.fn()
const mockIsMaximized = vi.fn()
const mockIsDestroyed = vi.fn()
const mockLoadURL = vi.fn()
const mockLoadFile = vi.fn()
const mockSetWindowOpenHandler = vi.fn()
const mockWebContentsOn = vi.fn()

function createMockBrowserWindowInstance() {
  return {
    minimize: mockMinimize,
    maximize: mockMaximize,
    unmaximize: mockUnmaximize,
    close: mockClose,
    hide: mockHide,
    show: mockShow,
    focus: mockFocus,
    getPosition: mockGetPosition,
    getSize: mockGetSize,
    setBounds: mockSetBounds,
    isMaximized: mockIsMaximized,
    isDestroyed: mockIsDestroyed,
    loadURL: mockLoadURL,
    loadFile: mockLoadFile,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers[event] = handler
    }),
    webContents: {
      setWindowOpenHandler: mockSetWindowOpenHandler,
      on: mockWebContentsOn,
    },
  }
}

vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: vi.fn(function (_options: unknown) {
    mockWindowOptions.current = _options
    return createMockBrowserWindowInstance()
  }),
  shell: {
    openExternal: vi.fn(),
  },
}))

const mockGetConfig = vi.fn()
const mockSetConfig = vi.fn()

vi.mock('./store', () => ({
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
  setConfig: (...args: unknown[]) => mockSetConfig(...args),
}))

vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173')
vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window')

describe('window service', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.keys(eventHandlers).forEach((k) => delete eventHandlers[k])
    mockMinimize.mockReset()
    mockMaximize.mockReset()
    mockUnmaximize.mockReset()
    mockClose.mockReset()
    mockHide.mockReset()
    mockShow.mockReset()
    mockFocus.mockReset()
    mockGetPosition.mockReset()
    mockGetSize.mockReset()
    mockSetBounds.mockReset()
    mockIsMaximized.mockReset()
    mockIsDestroyed.mockReset()
    mockLoadURL.mockReset()
    mockLoadFile.mockReset()
    mockSetWindowOpenHandler.mockReset()
    mockWebContentsOn.mockReset()
    mockGetConfig.mockReset()
    mockSetConfig.mockReset()
    mockApp.isPackaged = false
    mockWindowOptions.current = undefined
  })

  describe('createMainWindow', () => {
    it('creates BrowserWindow with correct options', async () => {
      mockGetConfig.mockReturnValue({ x: 100, y: 200, width: 1024, height: 768 })

      const { createMainWindow } = await import('./window')
      const win = createMainWindow()

      expect(win).toBeDefined()
      expect(mockGetConfig).toHaveBeenCalledWith('windowBounds')
      // Position restaurée, taille fixe (une taille sauvegardée grossie est ignorée).
      expect(mockWindowOptions.current).toMatchObject({ x: 100, y: 200, width: 1280, height: 720 })
      expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173')
    })

    it('registers moved, resized and closed events', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      expect(eventHandlers['moved']).toBeDefined()
      expect(eventHandlers['resized']).toBeDefined()
      expect(eventHandlers['closed']).toBeDefined()
    })

    it('sets mainWindow to null on closed event', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow, getMainWindow } = await import('./window')
      createMainWindow()

      expect(getMainWindow()).not.toBeNull()

      eventHandlers['closed']()

      expect(getMainWindow()).toBeNull()
    })

    it('sets windowOpenHandler to deny and open external', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      expect(mockSetWindowOpenHandler).toHaveBeenCalled()
      const handler = mockSetWindowOpenHandler.mock.calls[0][0]
      const result = handler({ url: 'https://example.com' })
      expect(result).toEqual({ action: 'deny' })
    })

    it('loads file when no dev server URL', async () => {
      vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined)
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      expect(mockLoadFile).toHaveBeenCalled()
      expect(mockLoadURL).not.toHaveBeenCalled()

      vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173')
    })

    it('enables devTools in development', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const options = mockWindowOptions.current as { webPreferences: { devTools: boolean } }
      expect(options.webPreferences.devTools).toBe(true)
    })

    it('does not register before-input-event listener in development', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      expect(mockWebContentsOn).not.toHaveBeenCalled()
    })
  })

  describe('createMainWindow in production', () => {
    beforeEach(() => {
      mockApp.isPackaged = true
    })

    afterEach(() => {
      mockApp.isPackaged = false
    })

    it('disables devTools when packaged', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const options = mockWindowOptions.current as { webPreferences: { devTools: boolean } }
      expect(options.webPreferences.devTools).toBe(false)
    })

    it('registers before-input-event listener when packaged', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      expect(mockWebContentsOn).toHaveBeenCalledWith('before-input-event', expect.any(Function))
    })

    it('blocks F12 key', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const handler = mockWebContentsOn.mock.calls[0][1] as (
        event: { preventDefault: ReturnType<typeof vi.fn> },
        input: Record<string, unknown>
      ) => void
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'F12' })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('blocks Ctrl+Shift+I', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const handler = mockWebContentsOn.mock.calls[0][1] as (
        event: { preventDefault: ReturnType<typeof vi.fn> },
        input: Record<string, unknown>
      ) => void
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'I', control: true, shift: true })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('blocks Cmd+Alt+I (macOS)', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const handler = mockWebContentsOn.mock.calls[0][1] as (
        event: { preventDefault: ReturnType<typeof vi.fn> },
        input: Record<string, unknown>
      ) => void
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'i', meta: true, alt: true })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('blocks Ctrl+Shift+J (console)', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const handler = mockWebContentsOn.mock.calls[0][1] as (
        event: { preventDefault: ReturnType<typeof vi.fn> },
        input: Record<string, unknown>
      ) => void
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'J', control: true, shift: true })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('blocks Ctrl+Shift+C (inspect element)', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const handler = mockWebContentsOn.mock.calls[0][1] as (
        event: { preventDefault: ReturnType<typeof vi.fn> },
        input: Record<string, unknown>
      ) => void
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'C', control: true, shift: true })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('does not block normal keys', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const handler = mockWebContentsOn.mock.calls[0][1] as (
        event: { preventDefault: ReturnType<typeof vi.fn> },
        input: Record<string, unknown>
      ) => void
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'a', control: false, shift: false })

      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('does not block keyUp events', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow } = await import('./window')
      createMainWindow()

      const handler = mockWebContentsOn.mock.calls[0][1] as (
        event: { preventDefault: ReturnType<typeof vi.fn> },
        input: Record<string, unknown>
      ) => void
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyUp', key: 'F12' })

      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('saveWindowBounds (via events)', () => {
    it('saves position with the fixed size on moved event', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })
      mockGetPosition.mockReturnValue([150, 250])
      mockGetSize.mockReturnValue([1283, 722]) // grossie par le bug DPI
      mockIsDestroyed.mockReturnValue(false)

      const { createMainWindow } = await import('./window')
      createMainWindow()

      eventHandlers['moved']()

      expect(mockSetConfig).toHaveBeenCalledWith('windowBounds', {
        x: 150,
        y: 250,
        width: 1280,
        height: 720,
      })
    })

    it('saves bounds on resized event', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })
      mockGetPosition.mockReturnValue([100, 200])
      mockGetSize.mockReturnValue([1280, 720])
      mockIsDestroyed.mockReturnValue(false)

      const { createMainWindow } = await import('./window')
      createMainWindow()

      eventHandlers['resized']()

      expect(mockSetConfig).toHaveBeenCalledWith('windowBounds', {
        x: 100,
        y: 200,
        width: 1280,
        height: 720,
      })
    })

    it('does nothing when window is destroyed', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })
      mockIsDestroyed.mockReturnValue(true)

      const { createMainWindow } = await import('./window')
      createMainWindow()

      eventHandlers['moved']()

      expect(mockSetConfig).not.toHaveBeenCalled()
    })
  })

  describe('setWindowPosition', () => {
    it('moves with setBounds and keeps the fixed size', async () => {
      mockGetConfig.mockReturnValue({ width: 1280, height: 720 })
      mockIsDestroyed.mockReturnValue(false)

      const { createMainWindow, setWindowPosition } = await import('./window')
      createMainWindow()
      setWindowPosition(10.4, 20.6)

      expect(mockSetBounds).toHaveBeenCalledWith({ x: 10, y: 21, width: 1280, height: 720 })
    })

    it('does nothing when window is destroyed', async () => {
      mockGetConfig.mockReturnValue({ width: 1280, height: 720 })
      mockIsDestroyed.mockReturnValue(true)

      const { createMainWindow, setWindowPosition } = await import('./window')
      createMainWindow()
      setWindowPosition(10, 20)

      expect(mockSetBounds).not.toHaveBeenCalled()
    })
  })

  describe('minimizeWindow', () => {
    it('calls minimize on mainWindow', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow, minimizeWindow } = await import('./window')
      createMainWindow()
      minimizeWindow()

      expect(mockMinimize).toHaveBeenCalled()
    })

    it('does nothing when mainWindow is null', async () => {
      const { minimizeWindow } = await import('./window')
      minimizeWindow()

      expect(mockMinimize).not.toHaveBeenCalled()
    })
  })

  describe('maximizeWindow', () => {
    it('calls maximize when not maximized', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })
      mockIsMaximized.mockReturnValue(false)

      const { createMainWindow, maximizeWindow } = await import('./window')
      createMainWindow()
      maximizeWindow()

      expect(mockMaximize).toHaveBeenCalled()
      expect(mockUnmaximize).not.toHaveBeenCalled()
    })

    it('calls unmaximize when already maximized', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })
      mockIsMaximized.mockReturnValue(true)

      const { createMainWindow, maximizeWindow } = await import('./window')
      createMainWindow()
      maximizeWindow()

      expect(mockUnmaximize).toHaveBeenCalled()
      expect(mockMaximize).not.toHaveBeenCalled()
    })

    it('does nothing when mainWindow is null', async () => {
      const { maximizeWindow } = await import('./window')
      maximizeWindow()

      expect(mockIsMaximized).not.toHaveBeenCalled()
    })
  })

  describe('closeWindow', () => {
    it('calls close on mainWindow', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow, closeWindow } = await import('./window')
      createMainWindow()
      closeWindow()

      expect(mockClose).toHaveBeenCalled()
    })

    it('does nothing when mainWindow is null', async () => {
      const { closeWindow } = await import('./window')
      closeWindow()

      expect(mockClose).not.toHaveBeenCalled()
    })
  })

  describe('hideWindow', () => {
    it('calls hide on mainWindow', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow, hideWindow } = await import('./window')
      createMainWindow()
      hideWindow()

      expect(mockHide).toHaveBeenCalled()
    })

    it('does nothing when mainWindow is null', async () => {
      const { hideWindow } = await import('./window')
      hideWindow()

      expect(mockHide).not.toHaveBeenCalled()
    })
  })

  describe('restoreWindow', () => {
    it('calls show and focus on mainWindow', async () => {
      mockGetConfig.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 })

      const { createMainWindow, restoreWindow } = await import('./window')
      createMainWindow()
      restoreWindow()

      expect(mockShow).toHaveBeenCalled()
      expect(mockFocus).toHaveBeenCalled()
    })

    it('does nothing when mainWindow is null', async () => {
      const { restoreWindow } = await import('./window')
      restoreWindow()

      expect(mockShow).not.toHaveBeenCalled()
      expect(mockFocus).not.toHaveBeenCalled()
    })
  })
})
