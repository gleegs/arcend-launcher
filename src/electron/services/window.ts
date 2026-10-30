import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { getConfig, setConfig } from './store'
import type { WindowBounds } from '../types/ipc'

let mainWindow: BrowserWindow | null = null

// Taille fixe (fenêtre non redimensionnable). On n'utilise pas la taille
// sauvegardée : sur un écran à mise à l'échelle non entière (125 %, 150 %…),
// le bug Electron ci-dessous a pu la faire grossir et l'enregistrer.
const WINDOW_SIZE = { width: 1280, height: 720 }

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(): BrowserWindow {
  const bounds = getConfig('windowBounds')

  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    resizable: false,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  mainWindow.on('moved', saveWindowBounds)
  mainWindow.on('resized', saveWindowBounds)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const key = input.key.toLowerCase()
      const isDevToolsShortcut =
        key === 'f12' ||
        ((input.control || input.meta) && input.shift && key === 'i') ||
        ((input.control || input.meta) && input.alt && key === 'i') ||
        ((input.control || input.meta) && input.shift && key === 'j') ||
        ((input.control || input.meta) && input.alt && key === 'j') ||
        ((input.control || input.meta) && input.shift && key === 'c') ||
        ((input.control || input.meta) && input.alt && key === 'c')
      if (isDevToolsShortcut) {
        event.preventDefault()
      }
    })
  }

  return mainWindow
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const [x, y] = mainWindow.getPosition()
  const bounds: WindowBounds = { x, y, ...WINDOW_SIZE }
  setConfig('windowBounds', bounds)
}

export function minimizeWindow(): void {
  mainWindow?.minimize()
}

export function maximizeWindow(): void {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
}

export function closeWindow(): void {
  mainWindow?.close()
}

export function hideWindow(): void {
  mainWindow?.hide()
}

export function restoreWindow(): void {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

export function getWindowPosition(): { x: number; y: number } {
  if (!mainWindow || mainWindow.isDestroyed()) return { x: 0, y: 0 }
  const [x, y] = mainWindow.getPosition()
  return { x, y }
}

export function setWindowPosition(x: number, y: number): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // setBounds avec la taille explicite plutôt que setPosition : sous Windows,
  // avec une mise à l'échelle non entière, setPosition arrondit la taille et
  // la fenêtre grossit à chaque frame du drag (electron/electron#9477).
  mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), ...WINDOW_SIZE })
}
