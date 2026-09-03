import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from './electron/types/ipc'
import type {
  ElectronApi,
  AppConfig,
  AuthState,
  ArcMetadata,
  RemoteArc,
  LatestArticle,
  ServerStatus,
  IpcResult,
} from './electron/types/ipc'
import type { JavaInstallProgress, JavaInstallation, JavaRegistry } from './electron/types/java'
import type { PackwizInstallProgress, PackwizInstallation } from './electron/types/packwiz'
import type { ArcInstallProgress, ArcInstallation } from './electron/types/arc'
import type { MapDownloadProgress, MapInstallation } from './electron/types/mapDownload'
import type { LaunchOptions, LaunchProgress, LogEntry } from './electron/types/launcher'
import type { UpdateDownloadedInfo, UpdateStatus } from './electron/types/updater'

const electronApi: ElectronApi = {
  windowMinimize: () => ipcRenderer.invoke(IpcChannels.WINDOW_MINIMIZE) as Promise<IpcResult<void>>,
  windowMaximize: () => ipcRenderer.invoke(IpcChannels.WINDOW_MAXIMIZE) as Promise<IpcResult<void>>,
  windowClose: () => ipcRenderer.invoke(IpcChannels.WINDOW_CLOSE) as Promise<IpcResult<void>>,
  windowHide: () => ipcRenderer.invoke(IpcChannels.WINDOW_HIDE) as Promise<IpcResult<void>>,
  windowRestore: () => ipcRenderer.invoke(IpcChannels.WINDOW_RESTORE) as Promise<IpcResult<void>>,
  windowGetPosition: () =>
    ipcRenderer.invoke(IpcChannels.WINDOW_GET_POSITION) as Promise<
      IpcResult<{ x: number; y: number }>
    >,
  windowMove: (x: number, y: number) => ipcRenderer.send(IpcChannels.WINDOW_MOVE, x, y),
  storeGet: <K extends keyof AppConfig>(key: K) =>
    ipcRenderer.invoke(IpcChannels.STORE_GET, key) as Promise<IpcResult<AppConfig[K]>>,
  storeSet: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    ipcRenderer.invoke(IpcChannels.STORE_SET, key, value) as Promise<IpcResult<void>>,
  authLogin: () => ipcRenderer.invoke(IpcChannels.AUTH_LOGIN) as Promise<IpcResult<AuthState>>,
  authLogout: () => ipcRenderer.invoke(IpcChannels.AUTH_LOGOUT) as Promise<IpcResult<void>>,
  authRefresh: () => ipcRenderer.invoke(IpcChannels.AUTH_REFRESH) as Promise<IpcResult<AuthState>>,
  authGetState: () =>
    ipcRenderer.invoke(IpcChannels.AUTH_GET_STATE) as Promise<IpcResult<AuthState>>,
  javaGetRegistry: () =>
    ipcRenderer.invoke(IpcChannels.JAVA_GET_REGISTRY) as Promise<IpcResult<JavaRegistry>>,
  javaEnsure: (version: string) =>
    ipcRenderer.invoke(IpcChannels.JAVA_ENSURE, version) as Promise<IpcResult<JavaInstallation>>,
  javaInstall: (version: string) =>
    ipcRenderer.invoke(IpcChannels.JAVA_INSTALL, version) as Promise<IpcResult<JavaInstallation>>,
  javaIsInstalled: (version: string) =>
    ipcRenderer.invoke(IpcChannels.JAVA_IS_INSTALLED, version) as Promise<IpcResult<boolean>>,
  javaGetExecutable: (version: string) =>
    ipcRenderer.invoke(IpcChannels.JAVA_GET_EXECUTABLE, version) as Promise<IpcResult<string>>,
  onJavaInstallProgress: (callback: (progress: JavaInstallProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: JavaInstallProgress) =>
      callback(progress)
    ipcRenderer.on(IpcChannels.JAVA_ON_INSTALL_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.JAVA_ON_INSTALL_PROGRESS, handler)
    }
  },
  packwizEnsure: () =>
    ipcRenderer.invoke(IpcChannels.PACKWIZ_ENSURE) as Promise<IpcResult<PackwizInstallation>>,
  packwizInstall: () =>
    ipcRenderer.invoke(IpcChannels.PACKWIZ_INSTALL) as Promise<IpcResult<PackwizInstallation>>,
  packwizIsInstalled: () =>
    ipcRenderer.invoke(IpcChannels.PACKWIZ_IS_INSTALLED) as Promise<IpcResult<boolean>>,
  packwizGetJarPath: () =>
    ipcRenderer.invoke(IpcChannels.PACKWIZ_GET_JAR_PATH) as Promise<IpcResult<string>>,
  onPackwizInstallProgress: (callback: (progress: PackwizInstallProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: PackwizInstallProgress) =>
      callback(progress)
    ipcRenderer.on(IpcChannels.PACKWIZ_ON_INSTALL_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.PACKWIZ_ON_INSTALL_PROGRESS, handler)
    }
  },
  arcGetRegistry: () =>
    ipcRenderer.invoke(IpcChannels.ARC_GET_REGISTRY) as Promise<IpcResult<ArcInstallation[]>>,
  arcInstall: (arcId: string, metadata: ArcMetadata) =>
    ipcRenderer.invoke(IpcChannels.ARC_INSTALL, arcId, metadata) as Promise<
      IpcResult<ArcInstallation>
    >,
  arcUninstall: (arcId: string) =>
    ipcRenderer.invoke(IpcChannels.ARC_UNINSTALL, arcId) as Promise<IpcResult<void>>,
  arcIsInstalled: (arcId: string) =>
    ipcRenderer.invoke(IpcChannels.ARC_IS_INSTALLED, arcId) as Promise<IpcResult<boolean>>,
  arcGetPath: (arcId: string) =>
    ipcRenderer.invoke(IpcChannels.ARC_GET_PATH, arcId) as Promise<IpcResult<string>>,
  onArcInstallProgress: (callback: (progress: ArcInstallProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ArcInstallProgress) =>
      callback(progress)
    ipcRenderer.on(IpcChannels.ARC_ON_INSTALL_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.ARC_ON_INSTALL_PROGRESS, handler)
    }
  },
  arcFetchRemote: () =>
    ipcRenderer.invoke(IpcChannels.ARC_FETCH_REMOTE) as Promise<IpcResult<RemoteArc[]>>,
  arcFetchActive: () =>
    ipcRenderer.invoke(IpcChannels.ARC_FETCH_ACTIVE) as Promise<IpcResult<RemoteArc | null>>,
  mapDownload: (arcId: string) =>
    ipcRenderer.invoke(IpcChannels.MAP_DOWNLOAD, arcId) as Promise<IpcResult<MapInstallation>>,
  mapCancel: () => ipcRenderer.invoke(IpcChannels.MAP_CANCEL) as Promise<IpcResult<void>>,
  mapUninstall: (arcId: string) =>
    ipcRenderer.invoke(IpcChannels.MAP_UNINSTALL, arcId) as Promise<IpcResult<void>>,
  mapGetInstallation: (arcId: string) =>
    ipcRenderer.invoke(IpcChannels.MAP_GET_INSTALLATION, arcId) as Promise<
      IpcResult<MapInstallation | null>
    >,
  mapIsDownloading: () =>
    ipcRenderer.invoke(IpcChannels.MAP_IS_DOWNLOADING) as Promise<IpcResult<boolean>>,
  onMapDownloadProgress: (callback: (progress: MapDownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: MapDownloadProgress) =>
      callback(progress)
    ipcRenderer.on(IpcChannels.MAP_ON_DOWNLOAD_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.MAP_ON_DOWNLOAD_PROGRESS, handler)
    }
  },
  articleFetchLatest: () =>
    ipcRenderer.invoke(IpcChannels.ARTICLE_FETCH_LATEST) as Promise<
      IpcResult<LatestArticle | null>
    >,
  serverFetchStatus: () =>
    ipcRenderer.invoke(IpcChannels.SERVER_FETCH_STATUS) as Promise<IpcResult<ServerStatus>>,
  launchGame: (options: LaunchOptions) =>
    ipcRenderer.invoke(IpcChannels.LAUNCH_GAME, options) as Promise<IpcResult<void>>,
  launchCancel: () => ipcRenderer.invoke(IpcChannels.LAUNCH_CANCEL) as Promise<IpcResult<void>>,
  launchIsRunning: () =>
    ipcRenderer.invoke(IpcChannels.LAUNCH_IS_RUNNING) as Promise<IpcResult<boolean>>,
  onLaunchProgress: (callback: (progress: LaunchProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: LaunchProgress) =>
      callback(progress)
    ipcRenderer.on(IpcChannels.LAUNCH_ON_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.LAUNCH_ON_PROGRESS, handler)
    }
  },
  onLog: (callback: (entry: LogEntry) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry)
    ipcRenderer.on(IpcChannels.LAUNCH_ON_LOG, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.LAUNCH_ON_LOG, handler)
    }
  },
  shellOpenPath: (path: string) =>
    ipcRenderer.invoke(IpcChannels.SHELL_OPEN_PATH, path) as Promise<IpcResult<void>>,
  appGetVersion: () =>
    ipcRenderer.invoke(IpcChannels.APP_GET_VERSION) as Promise<IpcResult<string>>,
  updaterGetStatus: () =>
    ipcRenderer.invoke(IpcChannels.UPDATER_GET_STATUS) as Promise<IpcResult<UpdateStatus>>,
  updaterInstall: () => ipcRenderer.invoke(IpcChannels.UPDATER_INSTALL) as Promise<IpcResult<void>>,
  onUpdateDownloaded: (callback: (info: UpdateDownloadedInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateDownloadedInfo) =>
      callback(info)
    ipcRenderer.on(IpcChannels.UPDATER_ON_UPDATE_DOWNLOADED, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.UPDATER_ON_UPDATE_DOWNLOADED, handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
