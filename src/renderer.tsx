import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import './index.css'
import Sidebar from './app/components/Sidebar/Sidebar'
import { useArcStore, hasClassicCovers, classicCoverUrl } from './app/store/arc'
import { useWindowStore } from './app/store/window'
import { useProgressStore } from './app/store/progress'
import { useMapDownloadStore } from './app/store/mapDownload'
import { useModpackVersionStore, isModpackUpdatePending } from './app/store/modpackVersion'
import TitleBar from './app/components/TitleBar/TitleBar'
import AuthButton from './app/components/AuthButton/AuthButton'
import HoverLabel from './app/components/HoverLabel/HoverLabel'
import SocialButtons from './app/components/SocialButtons/SocialButtons'
import SettingsPanel from './app/components/SettingsPanel/SettingsPanel'
import ArcSettingsPanel from './app/components/ArcSettingsPanel/ArcSettingsPanel'
import PlayButton from './app/components/PlayButton/PlayButton'
import ProgressBar from './app/components/ProgressBar/ProgressBar'
import UpdateToast from './app/components/UpdateToast/UpdateToast'
import { useLogStore } from './app/store/log'
import InfoPanel from './app/components/InfoPanel/InfoPanel'
import Button from './app/components/Button/Button'
import { cachedImage } from './app/lib/cachedImage'
import { startWindowDrag } from './app/lib/windowDrag'

// Durée du fondu enchaîné entre deux arcs (doit couvrir l'animation .arc-scene-in).
const ARC_TRANSITION_MS = 800

type CoverLayer = { url: string; visible: boolean }

const App = () => {
  const selectedArc = useArcStore((s) => s.selectedArc)
  const coverIndex = useArcStore((s) => s.coverIndex)
  const cycleCover = useArcStore((s) => s.cycleCover)
  const refreshCoverForTime = useArcStore((s) => s.refreshCoverForTime)
  const classicCovers = useArcStore((s) => s.classicCovers)
  const toggleClassicCovers = useArcStore((s) => s.toggleClassicCovers)
  // Cumulative angle so each click spins the icon one more full turn.
  const [switchRotation, setSwitchRotation] = useState(0)
  const isHiding = useWindowStore((s) => s.isHiding)
  const setIsHiding = useWindowStore((s) => s.setIsHiding)
  const installActive = useProgressStore((s) => s.install.active)
  const installPercent = useProgressStore((s) => s.install.percent)
  const installLabel = useProgressStore((s) => s.install.label)
  const installError = useProgressStore((s) => s.install.error)
  const launchActive = useProgressStore((s) => s.launch.active)
  const launchPercent = useProgressStore((s) => s.launch.percent)
  const launchLabel = useProgressStore((s) => s.launch.label)
  const launchStatus = useProgressStore((s) => s.launch.status)
  const launchError = useProgressStore((s) => s.launch.error)
  const serverRelease = useModpackVersionStore((s) => s.serverRelease)
  const installedRelease = useModpackVersionStore((s) => s.installedRelease)
  const modpackInstalled = useModpackVersionStore((s) => s.installed)
  const refreshModpackVersion = useModpackVersionStore((s) => s.refresh)
  const mapDownload = useMapDownloadStore((s) => s.mapDownload)
  const initMapDownload = useMapDownloadStore((s) => s.init)
  const initProgress = useProgressStore((s) => s.init)
  const initLog = useLogStore((s) => s.init)

  useEffect(() => {
    initProgress()
  }, [initProgress])

  useEffect(() => {
    initMapDownload()
  }, [initMapDownload])

  useEffect(() => {
    initLog()
  }, [initLog])

  useEffect(() => {
    const onFocus = () => setIsHiding(false)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [setIsHiding])

  const covers = selectedArc?.coverUrl ?? []
  const canSwitchCovers = hasClassicCovers(covers)
  // Both sets stay mounted so switching cross-fades like the time-of-day change.
  const coverLayers = covers.flatMap((url, i) => {
    const layers = [{ url, visible: i === coverIndex && !(canSwitchCovers && classicCovers) }]
    if (canSwitchCovers && classicCoverUrl(url) !== url) {
      layers.push({ url: classicCoverUrl(url), visible: i === coverIndex && classicCovers })
    }
    return layers
  })

  // Changement d'arc : l'ancien fond reste affiché dessous le temps que le nouveau
  // apparaisse par-dessus (fondu enchaîné), au lieu d'être retiré d'un coup.
  const sceneSlug = selectedArc?.slug ?? null
  const lastSceneRef = useRef<{ slug: string | null; layers: CoverLayer[] } | null>(null)
  const [outgoingScene, setOutgoingScene] = useState<{
    slug: string | null
    layers: CoverLayer[]
  } | null>(null)
  // Layout effects : l'ancien fond est remis dessous AVANT que le navigateur ne
  // peigne la première image du nouvel arc (sinon un flash noir puis l'ancien fond
  // réapparaissant une fraction de seconde).
  useLayoutEffect(() => {
    // Lu avant la mise à jour du ref (effet suivant) : contient encore l'arc précédent.
    const last = lastSceneRef.current
    if (!last || last.slug === sceneSlug) return
    setOutgoingScene(last)
    const id = setTimeout(() => setOutgoingScene(null), ARC_TRANSITION_MS)
    return () => clearTimeout(id)
  }, [sceneSlug])
  useLayoutEffect(() => {
    lastSceneRef.current = { slug: sceneSlug, layers: coverLayers }
  })

  useEffect(() => {
    const urls = selectedArc?.coverUrl ?? []
    const preload = hasClassicCovers(urls) ? [...urls, ...urls.map(classicCoverUrl)] : urls
    preload.forEach((url) => {
      const img = new Image()
      img.src = cachedImage(url)
    })
  }, [selectedArc])

  useEffect(() => {
    if (selectedArc) {
      refreshModpackVersion(selectedArc.slug)
    }
  }, [selectedArc, refreshModpackVersion])

  // Re-evaluate the time-of-day cover every minute so the hero background
  // switches live (e.g. day -> sunset) while the launcher stays open.
  useEffect(() => {
    const id = setInterval(refreshCoverForTime, 60_000)
    return () => clearInterval(id)
  }, [refreshCoverForTime])

  return (
    <div
      className={`rounded-3xl bg-surface w-full h-full flex p-4 gap-4 transition-all duration-200 ${isHiding ? 'opacity-0 scale-95' : ''}`}
      onMouseDown={startWindowDrag}
    >
      <Sidebar />
      <main className="flex-1 rounded-2xl overflow-hidden relative bg-black">
        {outgoingScene && (
          <div key={`out-${outgoingScene.slug}`} className="absolute inset-0">
            {outgoingScene.layers.map(({ url, visible }) => (
              <img
                key={url}
                src={cachedImage(url)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: visible ? 1 : 0 }}
              />
            ))}
          </div>
        )}
        <div key={sceneSlug ?? 'none'} className="arc-scene-in absolute inset-0">
          {selectedArc && coverLayers.length > 0 ? (
            coverLayers.map(({ url, visible }) => (
              <img
                key={url}
                src={cachedImage(url)}
                alt={selectedArc.name ?? ''}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
                style={{ opacity: visible ? 1 : 0 }}
              />
            ))
          ) : (
            <img
              src="https://placehold.co/600x400?text=Image+Not+Found"
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
        </div>
        <div
          className="absolute top-0 left-0 p-8 flex items-start gap-6"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          {selectedArc?.logoUrl && (
            <img
              key={selectedArc.logoUrl}
              src={cachedImage(selectedArc.logoUrl)}
              alt={selectedArc.name ?? 'Arc logo'}
              onClick={cycleCover}
              className="arc-logo-in w-40 cursor-pointer transition-transform duration-150 hover:scale-105 active:scale-95"
            />
          )}
          {canSwitchCovers && (
            <Button
              onClick={() => {
                toggleClassicCovers()
                setSwitchRotation((deg) => deg + 360)
              }}
              className="group/label relative p-2"
              aria-label="Changer de fonds"
              aria-pressed={classicCovers}
            >
              <RefreshCw
                color="#fff"
                className="transition-transform duration-500 ease-in-out"
                style={{ transform: `rotate(${switchRotation}deg)` }}
              />
              <HoverLabel side="right">Changer de fond</HoverLabel>
            </Button>
          )}
        </div>
        <div className="absolute top-0 right-0 p-8 flex gap-8">
          <AuthButton />
          <TitleBar />
        </div>
        <SocialButtons />
        <div className="absolute bottom-0 left-0 p-8" style={{ WebkitAppRegion: 'no-drag' }}>
          <InfoPanel />
        </div>
        <div className="absolute bottom-0 right-0 p-8 flex flex-col items-end gap-3">
          {(installActive || installError) && (
            <ProgressBar percent={installPercent} label={installLabel} error={installError} />
          )}
          {(launchActive || launchError) && (
            <ProgressBar
              percent={launchPercent}
              label={
                launchStatus === 'validating_arc' &&
                isModpackUpdatePending({
                  installed: modpackInstalled,
                  serverRelease,
                  installedRelease,
                })
                  ? `Mise à jour du modpack vers ${serverRelease}…`
                  : launchLabel
              }
              error={launchError}
            />
          )}
          {(mapDownload.active || mapDownload.error) && (
            <ProgressBar
              percent={mapDownload.percent}
              label={mapDownload.label}
              sublabel={mapDownload.sublabel}
              error={mapDownload.error}
            />
          )}
          <PlayButton />
        </div>
        <SettingsPanel />
        <ArcSettingsPanel />
        <UpdateToast />
      </main>
    </div>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')
const root = createRoot(container)
root.render(<App />)
