import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import Button from '../Button/Button'
import DropdownMenu, { type MenuItem } from '../DropdownMenu/DropdownMenu'
import { useArcStore } from '../../store/arc'
import { useArcSettingsStore } from '../../store/arcSettings'
import { useAuthStore } from '../../store/auth'
import { useProgressStore } from '../../store/progress'
import { useMapDownloadStore } from '../../store/mapDownload'
import { isMapAvailable, remoteArcToMetadata } from '../../../electron/types/arc'
import {
  Download,
  Play,
  Square,
  EllipsisVertical,
  Settings,
  Trash2,
  NotebookPen,
  Map,
} from 'lucide-react'
import { isProposalArc, PROPOSE_ARC_DISCORD_URL } from '../../lib/proposalArc'

export default function PlayButton() {
  const selectedArc = useArcStore((s) => s.selectedArc)
  const setArcInstalled = useArcStore((s) => s.setArcInstalled)
  const uninstallArc = useArcStore((s) => s.uninstallArc)
  const authState = useAuthStore((s) => s.state)
  const getArcSettings = useArcSettingsStore((s) => s.getArcSettings)
  const toggleArcSettings = useArcSettingsStore((s) => s.toggleArcSettings)

  const install = useProgressStore((s) => s.install)
  const launch = useProgressStore((s) => s.launch)
  const startInstall = useProgressStore((s) => s.startInstall)
  const resetInstall = useProgressStore((s) => s.resetInstall)
  const resetLaunch = useProgressStore((s) => s.resetLaunch)

  const mapDownload = useMapDownloadStore((s) => s.mapDownload)
  const startMapDownload = useMapDownloadStore((s) => s.startMapDownload)
  const resetMapDownload = useMapDownloadStore((s) => s.resetMapDownload)
  const mapInstalled = useMapDownloadStore((s) => s.installed[selectedArc?.slug ?? ''] ?? false)
  const refreshMapInstalled = useMapDownloadStore((s) => s.refreshMapInstalled)
  const setMapInstalled = useMapDownloadStore((s) => s.setMapInstalled)

  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmMapRedownload, setConfirmMapRedownload] = useState(false)

  const isInstalling = install.active
  const isLaunching = launch.active
  const canPlay = authState.status !== 'unauthenticated'

  // Synchronise l'état « map installée » avec le registre disque (IPC) quand
  // l'arc sélectionné change.
  useEffect(() => {
    if (selectedArc) {
      refreshMapInstalled(selectedArc.slug)
    }
  }, [selectedArc, refreshMapInstalled])

  const wasInstallingRef = useRef(false)
  useEffect(() => {
    const justCompleted =
      wasInstallingRef.current && !install.active && install.percent === 100 && !install.error
    if (justCompleted && selectedArc) {
      setArcInstalled(selectedArc.slug, true)
    }
    wasInstallingRef.current = install.active
  }, [install.active, install.percent, install.error, selectedArc, setArcInstalled])

  if (!selectedArc) return null

  // Arc « à proposer » : pas d'installation/paramètres, juste un lien Discord.
  if (isProposalArc(selectedArc.slug)) {
    return (
      <a
        href={PROPOSE_ARC_DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-[22rem] py-2 flex justify-center items-center text-3xl font-black uppercase gap-3 bg-black rounded-full border-2 border-transparent hover:border-white shadow-button transition-colors duration-250 cursor-pointer"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        Proposer un arc
        <NotebookPen color="#fff0e6" width={26} height={26} />
      </a>
    )
  }

  const handleInstall = async () => {
    startInstall()
    const metadata = remoteArcToMetadata(selectedArc)
    const result = await window.electronAPI.arcInstall(selectedArc.slug, metadata)
    if (!result.ok) {
      resetInstall()
    }
  }

  const handlePlay = async () => {
    setCancelling(false)
    resetLaunch()
    const { maxMemory } = getArcSettings(selectedArc.slug)
    const result = await window.electronAPI.launchGame({
      arcId: selectedArc.slug,
      mode: authState.status === 'online' ? 'online' : 'offline',
      maxMemory: `${maxMemory}G`,
      minMemory: `${Math.floor(maxMemory / 2)}G`,
    })
    if (!result.ok) {
      resetLaunch()
    }
  }

  const handleStop = async () => {
    if (cancelling) return
    // On NE remet PAS l'UI sur « Jouer » tout de suite : c'est le statut
    // `closed` renvoyé par le main (une fois la synchro/le process coupé) qui
    // éteint l'état de lancement. Un resetLaunch() immédiat ferait clignoter le
    // bouton vers « Jouer » et le spam relancerait le jeu.
    setCancelling(true)
    await window.electronAPI.launchCancel()
  }

  const handleUninstallClick = async () => {
    if (!confirmUninstall) {
      setConfirmUninstall(true)
      return
    }
    await uninstallArc(selectedArc.slug)
    setConfirmUninstall(false)
  }

  const handleMapDownload = async () => {
    startMapDownload(selectedArc.slug)
    const result = await window.electronAPI.mapDownload(selectedArc.slug)
    if (!result.ok) {
      resetMapDownload()
    }
  }

  const handleMapRedownload = async () => {
    if (!confirmMapRedownload) {
      setConfirmMapRedownload(true)
      return
    }
    // Retélécharger = remplacer : on retire l'ancien monde (et les restes
    // d'un éventuel téléchargement interrompu) avant de relancer.
    await window.electronAPI.mapUninstall(selectedArc.slug)
    setMapInstalled(selectedArc.slug, false)
    setConfirmMapRedownload(false)
    await handleMapDownload()
  }

  const handleMapCancel = async () => {
    await window.electronAPI.mapCancel()
  }

  const isLoading = isInstalling || isLaunching
  const isMapDownloading = mapDownload.active && mapDownload.arcId === selectedArc.slug
  // Le kebab reste visible pendant le téléchargement de la map (contrairement
  // à l'install/launch) : c'est le seul point d'entrée pour l'annuler.
  const showKebab = selectedArc.installed && (!isLoading || isMapDownloading)
  const label = isInstalling
    ? `Installation ${Math.round(install.percent)}%`
    : isLaunching
      ? 'Lancement...'
      : selectedArc.installed
        ? 'Jouer'
        : 'Installer'

  // Pendant le lancement, le même bouton devient un bouton « Arrêter » qui
  // annule la synchro/le démarrage en cours (bordure rouge au survol).
  if (isLaunching) {
    return (
      <Button
        onClick={handleStop}
        disabled={cancelling}
        className={clsx(
          'flex w-80 items-center justify-center gap-3 border-2 py-2 text-3xl font-black uppercase',
          cancelling ? 'opacity-70' : '!opacity-100 hover:!border-red-500'
        )}
      >
        {cancelling ? 'Annulation…' : 'Arrêter'}
        <Square color="#fff0e6" width={22} height={22} fill="#fff0e6" />
      </Button>
    )
  }

  if (showKebab) {
    const menuItems: MenuItem[] = [
      {
        label: 'Paramètres',
        icon: <Settings color="#fff0e6" width={16} height={16} />,
        onClick: () => toggleArcSettings(),
      },
    ]

    // Téléchargement de la map : visible dès que la map est publiée pour un
    // arc terminé (contrôlé côté données via Supabase).
    if (isMapAvailable(selectedArc)) {
      if (isMapDownloading) {
        menuItems.push({
          label: 'Annuler le téléchargement',
          icon: <Map color="#fff0e6" width={16} height={16} />,
          onClick: handleMapCancel,
        })
      } else if (mapInstalled) {
        menuItems.push({
          label: confirmMapRedownload ? 'Confirmer ?' : 'Retélécharger la map',
          danger: true,
          keepOpenOnClick: !confirmMapRedownload,
          icon: <Map color="#fff" width={16} height={16} />,
          onClick: handleMapRedownload,
        })
      } else {
        menuItems.push({
          label: 'Télécharger la map',
          icon: <Map color="#fff0e6" width={16} height={16} />,
          onClick: handleMapDownload,
        })
      }
    }

    menuItems.push({
      label: confirmUninstall ? 'Confirmer ?' : 'Désinstaller',
      danger: true,
      keepOpenOnClick: !confirmUninstall,
      icon: <Trash2 color="#fff" width={16} height={16} />,
      onClick: handleUninstallClick,
    })

    return (
      <div className="relative w-80">
        <button
          onClick={handlePlay}
          disabled={!canPlay}
          className={clsx(
            'w-full flex items-center justify-center gap-3 py-2 pr-8 text-3xl font-black uppercase rounded-full border-2 border-transparent hover:border-white bg-black shadow-button transition-colors duration-250 cursor-pointer',
            !canPlay && 'opacity-50 cursor-not-allowed'
          )}
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          {label}
          <Play color="#fff0e6" width={26} height={26} />
        </button>
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <DropdownMenu
            items={menuItems}
            onClose={() => {
              setConfirmUninstall(false)
              setConfirmMapRedownload(false)
            }}
            trigger={
              <button
                type="button"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white border-2 border-transparent hover:border-black cursor-pointer transition-colors duration-250"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <EllipsisVertical color="#151013" width={20} height={20} />
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <Button
      onClick={selectedArc.installed ? handlePlay : handleInstall}
      disabled={isLoading || (selectedArc.installed && !canPlay)}
      className={clsx(
        'w-80 py-2 flex justify-center items-center text-3xl font-black uppercase gap-3 border-2',
        isLoading && '!opacity-100 border-0 hover:border-0'
      )}
    >
      {label}
      {selectedArc.installed && !isLoading && <Play color="#fff0e6" width={26} height={26} />}
      {!selectedArc.installed && !isLoading && <Download color="#fff0e6" width={26} height={26} />}
    </Button>
  )
}
