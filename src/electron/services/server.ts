import { GameDig } from 'gamedig'
import type { ServerStatus } from '../types/server'

// Serveur Minecraft Java Arcend (nouvelle IP depuis le changement de serveur).
const HOST = process.env.ARCEND_SERVER_HOST || '51.38.180.149'
const PORT = Number(process.env.ARCEND_SERVER_PORT) || 25565

/**
 * Interroge le serveur Minecraft via gamedig.
 * Une serveur injoignable / timeout n'est pas une erreur : on renvoie un
 * état « hors ligne » plutôt que de propager l'exception.
 */
export async function fetchServerStatus(): Promise<ServerStatus> {
  try {
    const state = await GameDig.query({
      type: 'minecraft',
      host: HOST,
      port: PORT,
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
