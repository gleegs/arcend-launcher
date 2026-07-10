import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IpcChannels } from '../types/ipc'
import { getMainWindow } from './window'
import type { LogEntry, LogLevel, LogSource } from '../types/launcher'

// Le launcher (logs du jeu) numérote ses entrées à partir de 1 en montant, et le
// renderer numérote ses logs locaux à partir de -1 en descendant. On réserve donc
// une plage haute aux logs applicatifs du process principal pour qu'aucune clé
// React n'entre en collision dans le panneau de logs.
let logIdCounter = 1_000_000

let logFile: { path: string; stream: fs.WriteStream } | null | undefined

/**
 * Fichier de log persistant, pour pouvoir demander leurs logs aux joueurs quand on
 * ne reproduit pas le bug. Résolu paresseusement : `app.getPath('logs')` n'est
 * valable qu'une fois l'app prête, et `app` est absent des tests unitaires.
 */
function getLogFile(): { path: string; stream: fs.WriteStream } | null {
  if (logFile !== undefined) return logFile
  try {
    const dir = app.getPath('logs')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, 'launcher.log')
    logFile = { path: filePath, stream: fs.createWriteStream(filePath, { flags: 'a' }) }
  } catch {
    logFile = null
  }
  return logFile
}

export function getLogFilePath(): string | null {
  return getLogFile()?.path ?? null
}

/**
 * Émet une entrée de log vers le panneau de logs du renderer, la console du
 * process principal, et le fichier de log.
 */
export function sendLog(level: LogLevel, message: string, source: LogSource = 'launcher'): void {
  const entry: LogEntry = {
    id: ++logIdCounter,
    timestamp: Date.now(),
    level,
    message,
    source,
  }

  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.LAUNCH_ON_LOG, entry)
  }

  const line = `[${new Date(entry.timestamp).toISOString()}] [${level.toUpperCase()}] ${message}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)

  try {
    getLogFile()?.stream.write(`${line}\n`)
  } catch {
    /* le logging ne doit jamais faire échouer l'appelant */
  }
}
