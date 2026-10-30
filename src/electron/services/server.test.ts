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
      host: 'play.arcend.fr',
      port: 25584,
      maxRetries: 1,
      socketTimeout: 3000,
      attemptTimeout: 4000,
    })
  })

  it("queries the arc's own server when it has an address", async () => {
    vi.mocked(GameDig.query).mockResolvedValue({ numplayers: 3, maxplayers: 20 } as never)

    await fetchServerStatus({ host: 'play.kinetic.example', port: 25570 })

    expect(GameDig.query).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'play.kinetic.example', port: 25570 })
    )
  })

  it('defaults the port to 25565 for an arc host without port', async () => {
    vi.mocked(GameDig.query).mockResolvedValue({ numplayers: 0, maxplayers: 0 } as never)

    await fetchServerStatus({ host: 'play.kinetic.example', port: null })

    expect(GameDig.query).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'play.kinetic.example', port: 25565 })
    )
  })

  it('falls back to the Arcend server when the arc has no host', async () => {
    vi.mocked(GameDig.query).mockResolvedValue({ numplayers: 0, maxplayers: 0 } as never)

    await fetchServerStatus({ host: null, port: 25570 })

    expect(GameDig.query).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'play.arcend.fr', port: 25584 })
    )
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
