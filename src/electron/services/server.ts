import { GameDig } from 'gamedig'
import type { ServerAddress, ServerStatus } from '../types/server'

// Serveur Minecraft Java Arcend (nouvelle IP depuis le changement de serveur).
const HOST = process.env.ARCEND_SERVER_HOST || '51.38.180.149'
const PORT = Number(process.env.ARCEND_SERVER_PORT) || 25565

/**
 * Interroge le serveur Minecraft via gamedig. Sans adresse (ou sans hôte), le
 * serveur Arcend par défaut est interrogé ; un arc hébergé ailleurs fournit la
 * sienne (`server_host` / `server_port` dans Supabase).
 * Une serveur injoignable / timeout n'est pas une erreur : on renvoie un
 * état « hors ligne » plutôt que de propager l'exception.
 */
export async function fetchServerStatus(address?: ServerAddress | null): Promise<ServerStatus> {
  const host = address?.host || HOST
  const port = address?.host ? address.port || 25565 : PORT
  try {
    const state = await GameDig.query({
      type: 'minecraft',
      host,
      port,
      maxRetries: 1,
      socketTimeout: 3000,
      attemptTimeout: 4000,
    })

    return {
      online: true,
      players: state.numplayers,
      maxPlayers: state.maxplayers,
    }
  } catch {
    return { online: false, players: 0, maxPlayers: 0 }
  }
}
