import blackLogo from '../../assets/images/black-logo.png'
import Arc from '../Arc/Arc'
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useArcStore } from '../../store/arc'
import { cachedImage } from '../../lib/cachedImage'
import { PINNED_ARC_SLUGS } from '../../lib/proposalArc'

// Hauteur commune des vignettes d'arc, largeur max (= largeur du contenu de la
// sidebar : w-20 − px-2*2) et écart vertical entre vignettes (space-y-3), pour
// positionner le connecteur de l'arc sélectionné.
const ARC_ROW_HEIGHT = 56
const ARC_MAX_WIDTH = 64
const ARC_ROW_GAP = 12

export default function Sidebar() {
  const arcs = useArcStore((s) => s.arcs)
  const setArcs = useArcStore((s) => s.setArcs)
  const selectArc = useArcStore((s) => s.selectArc)
  const selectedArc = useArcStore((s) => s.selectedArc)
  const selectedIndex = arcs.findIndex((a) => a.slug === selectedArc?.slug)
  const [version, setVersion] = useState('2.0.0')

  useEffect(() => {
    async function fetchArcs() {
      const [remoteRes, registryRes, versionRes] = await Promise.all([
        window.electronAPI.arcFetchRemote(),
        window.electronAPI.arcGetRegistry(),
        window.electronAPI.appGetVersion(),
      ])

      const remoteArcs = remoteRes.ok ? (remoteRes.data ?? []) : []
      const installations = registryRes.ok ? (registryRes.data ?? []) : []

      const installedIds = new Set(installations.map((i) => i.arcId))

      const items = remoteArcs.map((arc) => ({ ...arc, installed: installedIds.has(arc.slug) }))

      items.sort((a, b) => {
        const now = Date.now()
        const aStart = a.startDate ? new Date(a.startDate).getTime() : Infinity
        const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity
        const bStart = b.startDate ? new Date(b.startDate).getTime() : Infinity
        const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity

        const aActive = aStart <= now && aEnd >= now
        const bActive = bStart <= now && bEnd >= now

        if (aActive && !bActive) return -1
        if (!aActive && bActive) return 1
        if (aActive && bActive) return aEnd - bEnd

        const aUpcoming = aStart > now
        const bUpcoming = bStart > now

        if (aUpcoming && !bUpcoming) return -1
        if (!aUpcoming && bUpcoming) return 1
        if (aUpcoming && bUpcoming) return aStart - bStart

        return bStart - aStart
      })

      // Sélection par défaut : l'arc en cours (premier selon le calendrier),
      // avant d'épingler Horror puis le Prologue tout en haut.
      const defaultArc = items[0]
      const pinned = PINNED_ARC_SLUGS.flatMap((slug) => {
        const index = items.findIndex((a) => a.slug === slug)
        return index === -1 ? [] : items.splice(index, 1)
      })
      items.unshift(...pinned)

      if (versionRes.ok && versionRes.data) setVersion(versionRes.data)

      setArcs(items)
      if (defaultArc) selectArc(defaultArc)
    }

    fetchArcs()
  }, [selectArc, setArcs])

  return (
    <div className="relative z-20 bg-white w-20 h-full rounded-2xl px-2 py-4 text-black font-black flex flex-col space-y-4 select-none ">
      <div className="space-y-4">
        <img src={blackLogo} alt="Arcend logo" />
        <h3 className="uppercase leading-none text-center">
          Arcend
          <span className="block text-[13px]">Launcher</span>
        </h3>
      </div>
      <div className="flex-1 space-y-2">
        <h5 className="uppercase font-black text-sm">Arcs</h5>
        <div className="relative space-y-3 flex-1">
          {arcs.map((arc) => (
            <div
              key={arc.slug}
              onClick={() => selectArc(arc)}
              className={clsx(
                'transition-opacity duration-200',
                selectedArc?.slug === arc.slug ? 'opacity-100' : 'opacity-70'
              )}
            >
              <Arc
                src={
                  arc.thumbnailUrl ? cachedImage(arc.thumbnailUrl) : 'https://placehold.co/64x64'
                }
                height={ARC_ROW_HEIGHT}
                maxWidth={ARC_MAX_WIDTH}
              />
            </div>
          ))}
          {selectedIndex >= 0 && (
            <div
              className="absolute left-full ml-2 z-10 h-10 w-[18px] -translate-y-1/2 rounded-r-[4px] bg-white transition-[top] duration-300 ease-out pointer-events-none"
              style={{ top: selectedIndex * (ARC_ROW_HEIGHT + ARC_ROW_GAP) + ARC_ROW_HEIGHT / 2 }}
            />
          )}
        </div>
      </div>
      <div className="space-y-1">
        {import.meta.env.DEV && (
          <span className="block text-center text-[10px] font-black uppercase text-red-600">
            Dev mode
          </span>
        )}
        <span className="uppercase text-xs text-center block">Version</span>
        <a
          href="https://www.arcend.fr/changelog"
          target="_blank"
          rel="noopener noreferrer"
          className="block font-normal text-[10px] w-full p-2.5 bg-black text-center text-white rounded-xl wrap-normal cursor-pointer border border-transparent hover:border-white transition-colors duration-250"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          v{version}
        </a>
      </div>
    </div>
  )
}
