import type { JavaInstallation, JavaInstallProgress, JavaRegistry } from './java'
import type { PackwizInstallation, PackwizInstallProgress } from './packwiz'
import type { ArcInstallation, ArcInstallProgress, ArcMetadata, RemoteArc } from './arc'
import type { MapDownloadProgress, MapInstallation } from './mapDownload'
import type { LaunchOptions, LaunchProgress, LogEntry } from './launcher'
import type { UpdateStatus, UpdateDownloadedInfo } from './updater'
import type { LatestArticle } from './article'
import type { ServerStatus } from './server'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export interface CachedProfile {
  id: string
  name: string
}

export type AuthState =
  | { status: 'online'; profile: CachedProfile }
  | { status: 'offline'; profile: CachedProfile }
  | { status: 'unauthenticated' }

export interface ArcSettings {
  maxMemory: number
}

export interface AppConfig {
  windowBounds: WindowBounds
  encryptedRefreshToken?: string
  cachedProfile?: CachedProfile
  arcSettings: Record<string, ArcSettings>
}

export const IpcChannels = {
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_HIDE: 'window:hide',
  WINDOW_RESTORE: 'window:restore',
  WINDOW_GET_POSITION: 'window:getPosition',
  WINDOW_MOVE: 'window:move',
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_REFRESH: 'auth:refresh',
  AUTH_GET_STATE: 'auth:getState',
  JAVA_GET_REGISTRY: 'java:getRegistry',
  JAVA_ENSURE: 'java:ensure',
  JAVA_INSTALL: 'java:install',
  JAVA_IS_INSTALLED: 'java:isInstalled',
  JAVA_GET_EXECUTABLE: 'java:getExecutable',
  JAVA_ON_INSTALL_PROGRESS: 'java:onInstallProgress',
  PACKWIZ_ENSURE: 'packwiz:ensure',
  PACKWIZ_INSTALL: 'packwiz:install',
  PACKWIZ_IS_INSTALLED: 'packwiz:isInstalled',
  PACKWIZ_GET_JAR_PATH: 'packwiz:getJarPath',
  PACKWIZ_ON_INSTALL_PROGRESS: 'packwiz:onInstallProgress',
  ARC_GET_REGISTRY: 'arc:getRegistry',
  ARC_INSTALL: 'arc:install',
  ARC_UNINSTALL: 'arc:uninstall',
  ARC_IS_INSTALLED: 'arc:isInstalled',
  ARC_GET_PATH: 'arc:getPath',
  ARC_ON_INSTALL_PROGRESS: 'arc:onInstallProgress',
  ARC_FETCH_REMOTE: 'arc:fetchRemote',
  ARC_FETCH_ACTIVE: 'arc:fetchActive',
  MAP_DOWNLOAD: 'map:download',
  MAP_CANCEL: 'map:cancel',
  MAP_UNINSTALL: 'map:uninstall',
  MAP_GET_INSTALLATION: 'map:getInstallation',
  MAP_IS_DOWNLOADING: 'map:isDownloading',
  MAP_ON_DOWNLOAD_PROGRESS: 'map:onDownloadProgress',
  ARTICLE_FETCH_LATEST: 'article:fetchLatest',
  SERVER_FETCH_STATUS: 'server:fetchStatus',
  LAUNCH_GAME: 'launch:game',
  LAUNCH_CANCEL: 'launch:cancel',
  LAUNCH_IS_RUNNING: 'launch:isRunning',
  LAUNCH_ON_PROGRESS: 'launch:onProgress',
  LAUNCH_ON_LOG: 'launch:onLog',
  SHELL_OPEN_PATH: 'shell:openPath',
  APP_GET_VERSION: 'app:getVersion',
  UPDATER_GET_STATUS: 'updater:getStatus',
  UPDATER_INSTALL: 'updater:install',
  UPDATER_ON_UPDATE_DOWNLOADED: 'updater:onUpdateDownloaded',
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface ElectronApi {
  windowMinimize: () => Promise<IpcResult<void>>
  windowMaximize: () => Promise<IpcResult<void>>
  windowClose: () => Promise<IpcResult<void>>
  windowHide: () => Promise<IpcResult<void>>
  windowRestore: () => Promise<IpcResult<void>>
  windowGetPosition: () => Promise<IpcResult<{ x: number; y: number }>>
  /** One-way (send) : déplace la fenêtre, sans round-trip, pour un drag fluide. */
  windowMove: (x: number, y: number) => void
  storeGet: <K extends keyof AppConfig>(key: K) => Promise<IpcResult<AppConfig[K]>>
  storeSet: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<IpcResult<void>>
  authLogin: () => Promise<IpcResult<AuthState>>
  authLogout: () => Promise<IpcResult<void>>
  authRefresh: () => Promise<IpcResult<AuthState>>
  authGetState: () => Promise<IpcResult<AuthState>>
  javaGetRegistry: () => Promise<IpcResult<JavaRegistry>>
  javaEnsure: (version: string) => Promise<IpcResult<JavaInstallation>>
  javaInstall: (version: string) => Promise<IpcResult<JavaInstallation>>
  javaIsInstalled: (version: string) => Promise<IpcResult<boolean>>
  javaGetExecutable: (version: string) => Promise<IpcResult<string>>
  onJavaInstallProgress: (callback: (progress: JavaInstallProgress) => void) => () => void
  packwizEnsure: () => Promise<IpcResult<PackwizInstallation>>
  packwizInstall: () => Promise<IpcResult<PackwizInstallation>>
  packwizIsInstalled: () => Promise<IpcResult<boolean>>
  packwizGetJarPath: () => Promise<IpcResult<string>>
  onPackwizInstallProgress: (callback: (progress: PackwizInstallProgress) => void) => () => void
  arcGetRegistry: () => Promise<IpcResult<ArcInstallation[]>>
  arcInstall: (arcId: string, metadata: ArcMetadata) => Promise<IpcResult<ArcInstallation>>
  arcUninstall: (arcId: string) => Promise<IpcResult<void>>
  arcIsInstalled: (arcId: string) => Promise<IpcResult<boolean>>
  arcGetPath: (arcId: string) => Promise<IpcResult<string>>
  onArcInstallProgress: (callback: (progress: ArcInstallProgress) => void) => () => void
  arcFetchRemote: () => Promise<IpcResult<RemoteArc[]>>
  arcFetchActive: () => Promise<IpcResult<RemoteArc | null>>
  mapDownload: (arcId: string) => Promise<IpcResult<MapInstallation>>
  mapCancel: () => Promise<IpcResult<void>>
  mapUninstall: (arcId: string) => Promise<IpcResult<void>>
  mapGetInstallation: (arcId: string) => Promise<IpcResult<MapInstallation | null>>
  mapIsDownloading: () => Promise<IpcResult<boolean>>
  onMapDownloadProgress: (callback: (progress: MapDownloadProgress) => void) => () => void
  articleFetchLatest: () => Promise<IpcResult<LatestArticle | null>>
  serverFetchStatus: () => Promise<IpcResult<ServerStatus>>
  launchGame: (options: LaunchOptions) => Promise<IpcResult<void>>
  launchCancel: () => Promise<IpcResult<void>>
  launchIsRunning: () => Promise<IpcResult<boolean>>
  onLaunchProgress: (callback: (progress: LaunchProgress) => void) => () => void
  onLog: (callback: (entry: LogEntry) => void) => () => void
  shellOpenPath: (pathArg: string) => Promise<IpcResult<void>>
  appGetVersion: () => Promise<IpcResult<string>>
  updaterGetStatus: () => Promise<IpcResult<UpdateStatus>>
  updaterInstall: () => Promise<IpcResult<void>>
  onUpdateDownloaded: (callback: (info: UpdateDownloadedInfo) => void) => () => void
}

export type { ArcMetadata, RemoteArc } from './arc'
export type { ArcModLoader } from './arc'
export type { LatestArticle } from './article'
export type { ServerStatus } from './server'
