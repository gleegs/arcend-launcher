import { create } from 'zustand'
import type { ServerState } from '../../electron/types/arc'

/**
 * État des versions du modpack pour l'arc sélectionné : release active du
 * serveur (server_state Supabase) et version locale installée (registre).
 * Alimente l'affichage « client/serveur » et l'état « mise à jour au
 * prochain lancement » (PRD-209).
 */
interface ModpackVersionState {
  /** Release active publiée par le serveur, null si inconnue. */
  serverRelease: string | null
  /** Version locale du modpack (metadata.version de l'installation), null si non installé. */
  installedRelease: string | null
  installed: boolean
  refresh: (arcSlug: string) => Promise<void>
}

export const useModpackVersionStore = create<ModpackVersionState>((set) => ({
  serverRelease: null,
  installedRelease: null,
  installed: false,
  refresh: async (arcSlug) => {
    const [stateRes, registryRes] = await Promise.all([
      window.electronAPI.arcFetchServerState(arcSlug).catch(() => null),
      window.electronAPI.arcGetRegistry().catch(() => null),
    ])
    const serverState: ServerState | null | undefined = stateRes?.ok ? stateRes.data : undefined
    const installation =
      registryRes?.ok && registryRes.data
        ? registryRes.data.find((inst) => inst.arcId === arcSlug)
        : undefined
    set({
      serverRelease: serverState?.activeRelease ?? null,
      installedRelease: installation?.metadata.version ?? null,
      installed: Boolean(installation),
    })
  },
}))

/** `true` si le modpack local sera mis à jour au prochain lancement (sync). */
export function isModpackUpdatePending(state: {
  installed: boolean
  serverRelease: string | null
  installedRelease: string | null
}): boolean {
  return Boolean(
    state.installed && state.serverRelease && state.installedRelease !== state.serverRelease
  )
}
