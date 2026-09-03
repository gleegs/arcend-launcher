import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import './index.css'
import Sidebar from './app/components/Sidebar/Sidebar'
import { useArcStore } from './app/store/arc'
import { useWindowStore } from './app/store/window'
import { useProgressStore } from './app/store/progress'
import { useMapDownloadStore } from './app/store/mapDownload'
import TitleBar from './app/components/TitleBar/TitleBar'
import AuthButton from './app/components/AuthButton/AuthButton'
import SocialButtons from './app/components/SocialButtons/SocialButtons'
import SettingsPanel from './app/components/SettingsPanel/SettingsPanel'
import ArcSettingsPanel from './app/components/ArcSettingsPanel/ArcSettingsPanel'
import PlayButton from './app/components/PlayButton/PlayButton'
import ProgressBar from './app/components/ProgressBar/ProgressBar'
import UpdateToast from './app/components/UpdateToast/UpdateToast'
import { useLogStore } from './app/store/log'
import InfoPanel from './app/components/InfoPanel/InfoPanel'
import { cachedImage } from './app/lib/cachedImage'
import { startWindowDrag } from './app/lib/windowDrag'

const App = () => {
  const selectedArc = useArcStore((s) => s.selectedArc)
  const coverIndex = useArcStore((s) => s.coverIndex)
  const cycleCover = useArcStore((s) => s.cycleCover)
  const refreshCoverForTime = useArcStore((s) => s.refreshCoverForTime)
  const isHiding = useWindowStore((s) => s.isHiding)
  const setIsHiding = useWindowStore((s) => s.setIsHiding)
  const installActive = useProgressStore((s) => s.install.active)
  const installPercent = useProgressStore((s) => s.install.percent)
  const installLabel = useProgressStore((s) => s.install.label)
  const installError = useProgressStore((s) => s.install.error)
  const launchActive = useProgressStore((s) => s.launch.active)
  const launchPercent = useProgressStore((s) => s.launch.percent)
  const launchLabel = useProgressStore((s) => s.launch.label)
  const launchError = useProgressStore((s) => s.launch.error)
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

  useEffect(() => {
    selectedArc?.coverUrl?.forEach((url) => {
      const img = new Image()
      img.src = cachedImage(url)
    })
  }, [selectedArc])

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
        {selectedArc?.coverUrl && selectedArc.coverUrl.length > 0 ? (
          selectedArc.coverUrl.map((url, i) => (
            <img
              key={url}
              src={cachedImage(url)}
              alt={selectedArc.name ?? ''}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
              style={{ opacity: i === coverIndex ? 1 : 0 }}
            />
          ))
        ) : (
          <img
            src="https://placehold.co/600x400?text=Image+Not+Found"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute top-0 left-0 p-8" style={{ WebkitAppRegion: 'no-drag' }}>
          {selectedArc?.logoUrl && (
            <img
              src={cachedImage(selectedArc.logoUrl)}
              alt={selectedArc.name ?? 'Arc logo'}
              onClick={cycleCover}
              className=" w-40 cursor-pointer transition-transform duration-150 hover:scale-105 active:scale-95"
            />
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
            <ProgressBar percent={launchPercent} label={launchLabel} error={launchError} />
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
