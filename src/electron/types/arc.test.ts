import { describe, it, expect } from 'vitest'
import { isActiveArc, isMapAvailable, remoteArcToMetadata } from './arc'
import type { RemoteArc } from './arc'

function makeArc(overrides: Partial<RemoteArc> = {}): RemoteArc {
  return {
    slug: 'arcend-01',
    name: 'ARC 01',
    description: null,
    version: '1.0',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-06-01T00:00:00Z',
    mcVersion: '1.21',
    javaVersion: '21',
    loader: 'forge',
    loaderVersion: '51',
    loaderInstallUrl: 'https://example.com/forge.jar',
    modpackUrl: 'https://example.com/pack.toml',
    coverUrl: null,
    thumbnailUrl: null,
    logoUrl: null,
    createdAt: '2025-12-01T00:00:00Z',
    mapUrl: null,
    mapExtractedSizeBytes: null,
    mapSha256: null,
    ...overrides,
  }
}

describe('isMapAvailable', () => {
  it('returns false when mapUrl is not published', () => {
    expect(isMapAvailable(makeArc())).toBe(false)
  })

  it('returns false when the arc has no end date (still running)', () => {
    expect(isMapAvailable(makeArc({ mapUrl: 'https://example.com/map.zip', endDate: null }))).toBe(
      false
    )
  })

  it('returns false when the arc is not finished yet', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(
      isMapAvailable(makeArc({ mapUrl: 'https://example.com/map.zip', endDate: future }))
    ).toBe(false)
  })

  it('returns true when the map is published and the arc is finished', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    expect(isMapAvailable(makeArc({ mapUrl: 'https://example.com/map.zip', endDate: past }))).toBe(
      true
    )
  })
})

describe('isActiveArc (non-régression)', () => {
  it('derives activity from dates', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(isActiveArc(makeArc({ startDate: past, endDate: future }))).toBe(true)
    expect(isActiveArc(makeArc({ startDate: past, endDate: past }))).toBe(false)
    expect(isActiveArc(makeArc({ startDate: future, endDate: future }))).toBe(false)
  })
})

describe('remoteArcToMetadata (non-régression)', () => {
  it('maps remote fields to install metadata', () => {
    const metadata = remoteArcToMetadata(makeArc())
    expect(metadata.arcId).toBe('arcend-01')
    expect(metadata.packwizUrl).toBe('https://example.com/pack.toml')
    expect(metadata.modLoader?.installerUrl).toBe('https://example.com/forge.jar')
  })
})
