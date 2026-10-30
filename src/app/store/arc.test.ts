import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  classicCoverUrl,
  coverIndexForTime,
  hasClassicCovers,
  useArcStore,
  type ArcItem,
} from './arc'

const COVERS = [
  'https://example.com/arc/cover/arc_01_cover_sunset.jpg',
  'https://example.com/arc/cover/arc_01_cover_day.jpg',
  'https://example.com/arc/cover/arc_01_cover_night.jpg',
]

const at = (hour: number) => new Date(2026, 0, 1, hour, 0, 0)

describe('coverIndexForTime', () => {
  it('picks the day cover during daytime hours (8h-17h)', () => {
    expect(coverIndexForTime(COVERS, at(8))).toBe(1)
    expect(coverIndexForTime(COVERS, at(12))).toBe(1)
    expect(coverIndexForTime(COVERS, at(16))).toBe(1)
  })

  it('picks the sunset cover at dawn (6h-8h) and dusk (17h-21h)', () => {
    expect(coverIndexForTime(COVERS, at(6))).toBe(0)
    expect(coverIndexForTime(COVERS, at(7))).toBe(0)
    expect(coverIndexForTime(COVERS, at(17))).toBe(0)
    expect(coverIndexForTime(COVERS, at(20))).toBe(0)
  })

  it('picks the night cover at night (21h-6h)', () => {
    expect(coverIndexForTime(COVERS, at(21))).toBe(2)
    expect(coverIndexForTime(COVERS, at(0))).toBe(2)
    expect(coverIndexForTime(COVERS, at(5))).toBe(2)
  })

  it('matches regardless of array order', () => {
    const reordered = [COVERS[2], COVERS[0], COVERS[1]]
    expect(coverIndexForTime(reordered, at(12))).toBe(2)
  })

  it('falls back to 0 when no cover matches or list is empty', () => {
    expect(coverIndexForTime(['https://example.com/plain.jpg'], at(12))).toBe(0)
    expect(coverIndexForTime([], at(12))).toBe(0)
    expect(coverIndexForTime(null, at(12))).toBe(0)
  })
})

describe('refreshCoverForTime', () => {
  afterEach(() => {
    vi.useRealTimers()
    useArcStore.setState({ selectedArc: null, coverIndex: 0, autoCoverIndex: 0 })
  })

  const arc = { coverUrl: COVERS } as ArcItem

  it('updates coverIndex when the time slot changes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at(12)) // day -> index 1
    useArcStore.getState().selectArc(arc)
    expect(useArcStore.getState().coverIndex).toBe(1)

    vi.setSystemTime(at(21)) // night -> index 2
    useArcStore.getState().refreshCoverForTime()
    expect(useArcStore.getState().coverIndex).toBe(2)
  })

  it('keeps a manual cover until the time slot changes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at(12))
    useArcStore.getState().selectArc(arc)
    useArcStore.getState().cycleCover() // manual -> index 2
    expect(useArcStore.getState().coverIndex).toBe(2)

    useArcStore.getState().refreshCoverForTime() // still daytime, no override
    expect(useArcStore.getState().coverIndex).toBe(2)
  })
})

describe('classic covers', () => {
  const V2 = COVERS.map((url) => url.replace('/arc_01_', '/v2_arc_01_'))

  afterEach(() => {
    useArcStore.setState({ classicCovers: false })
  })

  it('detects versioned covers', () => {
    expect(hasClassicCovers(V2)).toBe(true)
    expect(hasClassicCovers(['https://example.com/v2/arc_01_cover_day.jpg'])).toBe(false)
    expect(hasClassicCovers(COVERS)).toBe(false)
    expect(hasClassicCovers(null)).toBe(false)
  })

  it('strips the v2_ prefix and keeps the time-of-day keyword', () => {
    expect(V2.map(classicCoverUrl)).toEqual(COVERS)
    expect(classicCoverUrl(COVERS[0])).toBe(COVERS[0])
    expect(classicCoverUrl('https://example.com/v12_arc_01_cover_night.jpg')).toBe(
      'https://example.com/arc_01_cover_night.jpg'
    )
    expect(coverIndexForTime(V2, at(12))).toBe(1)
  })

  it('defaults to v2 covers and toggles', () => {
    expect(useArcStore.getState().classicCovers).toBe(false)
    useArcStore.getState().toggleClassicCovers()
    expect(useArcStore.getState().classicCovers).toBe(true)
    useArcStore.getState().toggleClassicCovers()
    expect(useArcStore.getState().classicCovers).toBe(false)
  })
})
