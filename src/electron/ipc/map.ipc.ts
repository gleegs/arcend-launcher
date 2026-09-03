import { IpcChannels } from '../types/ipc'
import {
  cancelMapDownload,
  getMapInstallation,
  installMap,
  isMapDownloadRunning,
  uninstallMap,
} from '../services/mapDownload'
import { safeHandle } from './utils'

export function registerMapIpc(): void {
  safeHandle(IpcChannels.MAP_DOWNLOAD, (arcId: unknown) => installMap(arcId as string))

  safeHandle(IpcChannels.MAP_CANCEL, () => cancelMapDownload())

  safeHandle(IpcChannels.MAP_UNINSTALL, (arcId: unknown) => uninstallMap(arcId as string))

  safeHandle(IpcChannels.MAP_GET_INSTALLATION, (arcId: unknown) =>
    getMapInstallation(arcId as string)
  )

  safeHandle(IpcChannels.MAP_IS_DOWNLOADING, () => isMapDownloadRunning())
}
