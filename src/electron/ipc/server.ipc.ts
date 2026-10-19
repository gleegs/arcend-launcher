import { IpcChannels } from '../types/ipc'
import { fetchServerStatus } from '../services/server'
import { getCachedRemoteArc } from '../services/supabase'
import { safeHandle } from './utils'

export function registerServerIpc(): void {
  // Statut du serveur de l'arc sélectionné (adresse lue dans le cache des arcs,
  // sans requête Supabase à chaque polling) ; serveur Arcend par défaut sinon.
  safeHandle(IpcChannels.SERVER_FETCH_STATUS, (arcSlug: unknown) => {
    const arc = typeof arcSlug === 'string' ? getCachedRemoteArc(arcSlug) : null
    return fetchServerStatus(arc ? { host: arc.serverHost, port: arc.serverPort } : null)
  })
}
