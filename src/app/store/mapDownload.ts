import { create } from 'zustand'
import type { MapDownloadProgress, MapDownloadStatus } from '../../electron/types/mapDownload'

export interface MapDownloadState {
  active: boolean
  /** Slug de l'arc concerné par le téléchargement courant. */
  arcId: string | null
  /** Statut brut ('idle' au repos). */
  status: MapDownloadStatus | 'idle'
  /** Pourcentage global [0, 100] (download [0, 90], extraction [90, 100]). */
  percent: number
  label: string
  /** Détail secondaire (ex. « 12,4 / 30,2 Go »). */
  sublabel: string | null
  error: string | null
}

export const MAP_LABELS: Record<MapDownloadStatus, string> = {
  checking: 'Préparation du téléchargement',
  downloading: 'Téléchargement de la map',
  extracting: 'Extraction de la map',
  done: 'Map installée',
  cancelled: 'Téléchargement annulé',
  error: 'Échec du téléchargement',
}

/** Labels d'erreur selon la phase en échec (message honnête côté UI). */
export const MAP_ERROR_LABELS: Record<'download' | 'extract', string> = {
  download: 'Échec du téléchargement',
  extract: "Échec de l'extraction",
}

/** Formate des octets en Go (1 décimale, virgule FR) ou Mo. */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} Go`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} Mo`
}

/** Formate un débit en octets/s, toujours avec une décimale (« 42,7 Mo/s »). */
export function formatSpeed(bytesPerSec: number): string {
  const gb = bytesPerSec / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} Go/s`
  return `${Math.max(0.1, bytesPerSec / 1024 ** 2)
    .toFixed(1)
    .replace('.', ',')} Mo/s`
}

/** Formate une progression « 12,4 / 30,2 Go » (unité commune, non répétée). */
export function formatByteRatio(downloaded: number, total: number): string {
  if (total / 1024 ** 3 >= 1) {
    return `${(downloaded / 1024 ** 3).toFixed(1).replace('.', ',')} / ${formatBytes(total)}`
  }
  return `${Math.max(1, Math.round(downloaded / 1024 ** 2))} / ${formatBytes(total)}`
}

/** Formate un temps restant en secondes (« 45 s », « 12 min », « 1 h 05 »). */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.ceil(seconds)
  if (total < 60) return `${total} s`
  const minutes = Math.round(total / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours >= 99) return '99+ h'
  const rem = minutes % 60
  return rem > 0 ? `${hours} h ${String(rem).padStart(2, '0')}` : `${hours} h`
}

/** Échantillon de progression pour le calcul du débit. */
export interface DownloadSample {
  at: number
  bytes: number
}

/**
 * Ajoute un échantillon et supprime ceux plus vieux que `windowMs`, pour
 * calculer le débit sur une fenêtre glissante (lisse les à-coups réseau).
 */
export function pushSample(
  samples: DownloadSample[],
  at: number,
  bytes: number,
  windowMs = 8000
): DownloadSample[] {
  const next = [...samples.filter((sample) => at - sample.at <= windowMs), { at, bytes }]
  return next
}

/**
 * Débit en octets/s déduit des échantillons (premier → dernier de la fenêtre).
 * Retourne null tant que la fenêtre est trop courte (< 500 ms) ou si le
 * compteur n'a pas progressé (restart d'un téléchargement, stall).
 */
export function computeSpeedBytesPerSec(samples: DownloadSample[]): number | null {
  if (samples.length < 2) return null
  const first = samples[0]
  const last = samples[samples.length - 1]
  const dtSec = (last.at - first.at) / 1000
  const dBytes = last.bytes - first.bytes
  if (dtSec < 0.5 || dBytes <= 0) return null
  return dBytes / dtSec
}

const MAP_IDLE: MapDownloadState = {
  active: false,
  arcId: null,
  status: 'idle',
  percent: 0,
  label: '',
  sublabel: null,
  error: null,
}

/** Débit courant fourni par l'appelant (calculé via computeSpeedBytesPerSec). */
export interface TransferRate {
  bytesPerSec: number | null
}

/**
 * Construit le nouvel état à partir d'un événement de téléchargement.
 * `rate` (optionnel) enrichit le sublabel du débit et du temps restant.
 * Pure function — testable isolément.
 */
export function applyMapProgress(
  prev: MapDownloadState,
  progress: MapDownloadProgress,
  rate?: TransferRate | null
): MapDownloadState {
  if (progress.status === 'error') {
    return {
      ...prev,
      active: false,
      percent: 0,
      label: progress.errorPhase ? MAP_ERROR_LABELS[progress.errorPhase] : MAP_LABELS.error,
      sublabel: null,
      error: progress.error ?? 'Erreur inconnue',
    }
  }
  if (progress.status === 'done') {
    return {
      ...prev,
      active: false,
      percent: 100,
      label: MAP_LABELS.done,
      sublabel: null,
      error: null,
    }
  }
  if (progress.status === 'cancelled') {
    return {
      ...prev,
      active: false,
      percent: 0,
      label: MAP_LABELS.cancelled,
      sublabel: null,
      error: null,
    }
  }
  const sublabel =
    (progress.status === 'downloading' || progress.status === 'extracting') &&
    progress.processedBytes != null
      ? [
          progress.totalBytes != null
            ? formatByteRatio(progress.processedBytes, progress.totalBytes)
            : formatBytes(progress.processedBytes),
          rate?.bytesPerSec != null && rate.bytesPerSec > 0 ? formatSpeed(rate.bytesPerSec) : null,
          rate?.bytesPerSec != null &&
          rate.bytesPerSec > 0 &&
          progress.totalBytes != null &&
          progress.totalBytes > progress.processedBytes
            ? formatEta((progress.totalBytes - progress.processedBytes) / rate.bytesPerSec)
            : null,
        ]
          .filter((part) => part !== null)
          .join(' · ')
      : null
  return {
    active: true,
    arcId: progress.arcId,
    status: progress.status,
    percent: Math.max(0, Math.min(100, progress.percent)),
    label: MAP_LABELS[progress.status],
    sublabel,
    error: null,
  }
}

interface MapDownloadStore {
  mapDownload: MapDownloadState
  /** Maps déjà installées sur disque, par slug d'arc (via IPC). */
  installed: Record<string, boolean>
  /** Abonne le listener IPC. Idempotent via le guard `_initialized`. */
  init: () => void
  /** Active l'état « préparation » avant l'appel IPC `mapDownload`. */
  startMapDownload: (arcId: string) => void
  /** Réinitialise l'état (après done/error/cancel ou manuellement). */
  resetMapDownload: () => void
  /** Marque la map d'un arc installée (ou non) côté UI. */
  setMapInstalled: (arcId: string, installed: boolean) => void
  /** Relit l'état disque (registre maps) pour un arc via IPC. */
  refreshMapInstalled: (arcId: string) => Promise<void>
  _initialized: boolean
}

// Fenêtre d'échantillons du téléchargement courant (débit/ETA). Réinitialisée
// à chaque nouveau téléchargement (status checking ou changement d'arc).
let samples: DownloadSample[] = []

function resetSamples(): void {
  samples = []
}

export const useMapDownloadStore = create<MapDownloadStore>((set, get) => ({
  mapDownload: MAP_IDLE,
  installed: {},
  _initialized: false,
  init: () => {
    if (get()._initialized) return
    set({ _initialized: true })

    window.electronAPI.onMapDownloadProgress((progress) => {
      const state = get()
      // Reset des échantillons au changement d'arc OU de phase : le compteur
      // d'octets repart de zéro entre téléchargement (octets du zip) et
      // extraction (octets décompressés).
      if (
        progress.arcId !== state.mapDownload.arcId ||
        progress.status !== state.mapDownload.status
      ) {
        resetSamples()
      }
      let rate: TransferRate | null = null
      if (
        (progress.status === 'downloading' || progress.status === 'extracting') &&
        progress.processedBytes != null
      ) {
        samples = pushSample(samples, Date.now(), progress.processedBytes)
        rate = { bytesPerSec: computeSpeedBytesPerSec(samples) }
      }
      const patch: Partial<MapDownloadStore> = {
        mapDownload: applyMapProgress(state.mapDownload, progress, rate),
      }
      if (progress.status === 'done') {
        patch.installed = { ...state.installed, [progress.arcId]: true }
      }
      set(patch)
    })
  },
  startMapDownload: (arcId: string) => {
    resetSamples()
    set({
      mapDownload: {
        active: true,
        arcId,
        status: 'checking',
        percent: 0,
        label: MAP_LABELS.checking,
        sublabel: null,
        error: null,
      },
    })
  },
  resetMapDownload: () => {
    resetSamples()
    set({ mapDownload: MAP_IDLE })
  },
  setMapInstalled: (arcId: string, installed: boolean) =>
    set((state) => ({ installed: { ...state.installed, [arcId]: installed } })),
  refreshMapInstalled: async (arcId: string) => {
    const result = await window.electronAPI.mapGetInstallation(arcId)
    const installed = Boolean(result.ok && result.data)
    const state = get()
    if (state.installed[arcId] !== installed) {
      set({ installed: { ...state.installed, [arcId]: installed } })
    }
  },
}))
