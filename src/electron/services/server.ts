import { GameDig } from 'gamedig'
import type { ServerAddress, ServerStatus } from '../types/server'

// Serveur Minecraft Java Arcend par défaut (Kinetic, play.arcend.fr).
const HOST = process.env.ARCEND_SERVER_HOST || 'play.arcend.fr'
const PORT = Number(process.env.ARCEND_SERVER_PORT) || 25584

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
