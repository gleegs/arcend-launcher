export interface ServerAddress {
  host: string | null
  port: number | null
}

export interface ServerStatus {
  online: boolean
  players: number
  maxPlayers: number
}
