import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, protocol } from 'electron'
import started from 'electron-squirrel-startup'
import { initStore } from './electron/services/store'
import { createMainWindow, getMainWindow } from './electron/services/window'
import { registerAllIpcHandlers } from './electron/ipc'
import { refresh as refreshAuth } from './electron/services/auth'
import { fetchArcsWithCache } from './electron/services/supabase'
import { initUpdater } from './electron/services/updater'
import { registerImageProtocol, IMAGE_PROTOCOL } from './electron/services/imageCache'
import { arcendDir } from './electron/lib/paths'

// Filet de sécurité : écrit toute erreur non interceptée du process principal
// dans <arcendDir>/logs/crash.log. Sur un build packagé (notamment macOS),
// stdout/stderr n'est visible nulle part — sans ça, un plantage laisse zéro trace.
function writeCrashLog(type: string, error: unknown): void {
  try {
    const logsDir = path.join(arcendDir, 'logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
        : String(error)
    const line = `[${new Date().toISOString()}] [${type}] ${message}\n`
    fs.appendFileSync(path.join(logsDir, 'crash.log'), line, 'utf-8')
  } catch {
    // ne jamais planter dans le handler de crash
  }
}

process.on('uncaughtException', (error) => writeCrashLog('uncaughtException', error))
process.on('unhandledRejection', (reason) => writeCrashLog('unhandledRejection', reason))

// Doit être appelé avant que l'app soit prête.
protocol.registerSchemesAsPrivileged([
  {
    scheme: IMAGE_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true },
  },
])

if (started) {
  app.quit()
}

app.on('ready', () => {
  registerImageProtocol()
  initStore()
  registerAllIpcHandlers()
  createMainWindow()

  refreshAuth().catch(() => undefined)
  fetchArcsWithCache().catch(() => undefined)
  initUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.hide()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})
