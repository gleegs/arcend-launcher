export type MapDownloadStatus =
  | 'checking'
  | 'downloading'
  | 'extracting'
  | 'done'
  | 'cancelled'
  | 'error'

export interface MapDownloadProgress {
  arcId: string
  status: MapDownloadStatus
  /** Pourcentage global [0, 100] (download [0, 90], extraction [90, 100]). */
  percent: number
  /** Octets traités : téléchargés (`downloading`) ou extraits (`extracting`). */
  processedBytes?: number
  /** Taille totale en octets : zip (`downloading`) ou contenu décompressé (`extracting`). */
  totalBytes?: number
  error?: string
  /** Phase en échec : permet d'afficher « Échec du téléchargement » vs « Échec de l'extraction ». */
  errorPhase?: 'download' | 'extract'
}

export interface MapInstallation {
  arcId: string
  /** Chemin du dossier du monde installé dans minecraft/saves. */
  worldPath: string
  installedAt: string
  size: number
}

export interface MapRegistry {
  installations: Record<string, MapInstallation>
}

export interface MapDownloadMeta {
  /** ETag du zip distant : garantit qu'une reprise porte sur le même fichier. */
  etag: string | null
  /** Taille totale du zip en octets. */
  totalBytes: number
  /** Octets déjà écrits dans le .part lors du dernier téléchargement. */
  downloadedBytes: number
}
