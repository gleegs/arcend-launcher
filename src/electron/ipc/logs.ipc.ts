import { app, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IpcChannels } from '../types/ipc'
import { getLogFilePath } from '../services/log'
import { getMainWindow } from '../services/window'
import { safeHandle } from './utils'

export function registerLogsIpc(): void {
  // Copie launcher.log (historique complet, toutes sessions) vers l'emplacement
  // choisi par le joueur, pour qu'il puisse nous l'envoyer. null = annulé.
  safeHandle(IpcChannels.LOGS_EXPORT, async () => {
    const source = getLogFilePath()
    if (!source || !fs.existsSync(source)) throw new Error('Aucun fichier de log à exporter.')

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const options: Electron.SaveDialogOptions = {
      title: 'Enregistrer les logs',
      defaultPath: path.join(app.getPath('downloads'), `arcend-launcher-${stamp}.txt`),
      filters: [{ name: 'Fichier texte', extensions: ['txt'] }],
    }
    const win = getMainWindow()
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null

    await fs.promises.copyFile(source, filePath)
    return filePath
  })
}
