import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('gamedig', () => ({
  GameDig: {
    query: vi.fn(),
  },
}))

import { GameDig } from 'gamedig'
import { fetchServerStatus } from './server'

describe('fetchServerStatus', () => {
  beforeEach(() => {
    vi.mocked(GameDig.query).mockReset()
  })

  it('returns an online status with player counts on success', async () => {
    vi.mocked(GameDig.query).mockResolvedValue({
      name: 'Arcend',
      numplayers: 19,
      maxplayers: 100,
    } as never)

    expect(await fetchServerStatus()).toEqual({
      online: true,
      players: 19,
      maxPlayers: 100,
    })
  })

  it('queries the Arcend Minecraft server with a short timeout', async () => {
    vi.mocked(GameDig.query).mockResolvedValue({
      numplayers: 0,
      maxplayers: 0,
    } as never)

    await fetchServerStatus()

    expect(GameDig.query).toHaveBeenCalledWith({
      type: 'minecraft',
      host: '51.38.180.149',
      port: 25565,
      maxRetries: 1,
      socketTimeout: 3000,
      attemptTimeout: 4000,
    })
  })

  it('returns an offline status when the query rejects (timeout/unreachable)', async () => {
    vi.mocked(GameDig.query).mockRejectedValue(new Error('Timeout'))

    expect(await fetchServerStatus()).toEqual({
      online: false,
      players: 0,
      maxPlayers: 0,
    })
  })
})
