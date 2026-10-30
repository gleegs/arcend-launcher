import { create } from 'zustand'

type RemoteArc = Awaited<ReturnType<typeof window.electronAPI.arcFetchRemote>>['data'] extends
  | (infer T)[]
  | undefined
  ? T
  : never

export interface ArcItem extends RemoteArc {
  installed: boolean
}

/**
 * Picks the cover that matches the current time of day.
 *
 * Covers are matched by keyword found in their URL (e.g. `..._sunset.jpg`),
 * so the choice is resilient to the order of `coverUrl` in the backend.
 * Falls back to index 0 when no matching cover is found.
 */
export function coverIndexForTime(covers: string[] | null | undefined, now = new Date()): number {
  if (!covers || covers.length === 0) return 0

  const hour = now.getHours()
  let keywords: string[]
  if (hour >= 8 && hour < 17) {
    // Day: 08:00 -> 17:00
    keywords = ['day', 'noon']
  } else if (hour >= 21 || hour < 6) {
    // Night: 21:00 -> 06:00
    keywords = ['night', 'midnight']
  } else {
    // Sunset / sunrise: 06:00 -> 08:00 and 17:00 -> 21:00
    keywords = ['sunset', 'dusk', 'sunrise', 'dawn', 'afternoon', 'evening', 'morning']
  }

  const index = covers.findIndex((url) => {
    const name = url.toLowerCase()
    return keywords.some((keyword) => name.includes(keyword))
  })

  return index === -1 ? 0 : index
}

const VERSION_PREFIX = /\/v\d+_([^/]+)$/i

/** True when the arc ships versioned covers (`v2_…`) with a classic version alongside. */
export function hasClassicCovers(covers: string[] | null | undefined): boolean {
  return !!covers?.some((url) => VERSION_PREFIX.test(url))
}

/**
 * Classic version of a cover: same URL without the version prefix
 * (`v2_arc_01_cover_day.jpg` -> `arc_01_cover_day.jpg`). Order is preserved,
 * so `coverIndex` stays valid for both sets.
 */
export function classicCoverUrl(url: string): string {
  return url.replace(VERSION_PREFIX, '/$1')
}

interface ArcStore {
  arcs: ArcItem[]
  setArcs: (arcs: ArcItem[]) => void
  selectedArc: ArcItem | null
  selectArc: (arc: ArcItem | null) => void
  coverIndex: number
  /** Last cover index applied automatically from the time of day. */
  autoCoverIndex: number
  cycleCover: () => void
  refreshCoverForTime: () => void
  /** Show classic covers instead of versioned ones. Session only: reset on restart. */
  classicCovers: boolean
  toggleClassicCovers: () => void
  setArcInstalled: (arcId: string, installed: boolean) => void
  uninstallArc: (arcId: string) => Promise<boolean>
}

export const useArcStore = create<ArcStore>((set, get) => ({
  arcs: [],
  setArcs: (arcs) => set({ arcs }),
  selectedArc: null,
  selectArc: (arc) => {
    const index = coverIndexForTime(arc?.coverUrl)
    set({ selectedArc: arc, coverIndex: index, autoCoverIndex: index })
  },
  coverIndex: 0,
  autoCoverIndex: 0,
  cycleCover: () =>
    set((state) => {
      const covers = state.selectedArc?.coverUrl
      const len = covers?.length ?? 1
      return { coverIndex: (state.coverIndex + 1) % len }
    }),
  refreshCoverForTime: () =>
    set((state) => {
      const next = coverIndexForTime(state.selectedArc?.coverUrl)
      // Only switch when the time slot changed since the last auto update,
      // so a manual cycle (logo click) is preserved until the next boundary.
      return next === state.autoCoverIndex ? {} : { coverIndex: next, autoCoverIndex: next }
    }),
  classicCovers: false,
  toggleClassicCovers: () => set((state) => ({ classicCovers: !state.classicCovers })),
  setArcInstalled: (arcId, installed) =>
    set((state) => ({
      arcs: state.arcs.map((arc) => (arc.slug === arcId ? { ...arc, installed } : arc)),
      selectedArc:
        state.selectedArc && state.selectedArc.slug === arcId
          ? { ...state.selectedArc, installed }
          : state.selectedArc,
    })),
  uninstallArc: async (arcId) => {
    const result = await window.electronAPI.arcUninstall(arcId)
    if (result.ok) {
      get().setArcInstalled(arcId, false)
      return true
    }
    return false
  },
}))
