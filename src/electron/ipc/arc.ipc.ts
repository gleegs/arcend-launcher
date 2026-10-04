import { IpcChannels } from '../types/ipc'
import {
  getInstalledArcs,
  installArc,
  uninstallArc,
  isInstalled,
  getArcPath,
} from '../services/arc'
import { fetchArcsWithCache, fetchActiveArc, fetchServerState } from '../services/supabase'
import type { ArcMetadata } from '../types/arc'
import { safeHandle } from './utils'

export function registerArcIpc(): void {
  safeHandle(IpcChannels.ARC_GET_REGISTRY, () => getInstalledArcs())

  safeHandle(IpcChannels.ARC_INSTALL, (arcId: unknown, metadata: unknown) =>
    installArc(arcId as string, metadata as ArcMetadata)
  )

  safeHandle(IpcChannels.ARC_UNINSTALL, (arcId: unknown) => uninstallArc(arcId as string))

  safeHandle(IpcChannels.ARC_IS_INSTALLED, (arcId: unknown) => isInstalled(arcId as string))

  safeHandle(IpcChannels.ARC_GET_PATH, (arcId: unknown) => getArcPath(arcId as string))

  safeHandle(IpcChannels.ARC_FETCH_REMOTE, () => fetchArcsWithCache())

  safeHandle(IpcChannels.ARC_FETCH_ACTIVE, () => fetchActiveArc())

  safeHandle(IpcChannels.ARC_FETCH_SERVER_STATE, (arcSlug: unknown) =>
    fetchServerState(arcSlug as string)
  )
}
