export interface LatestYoutubeVideo {
  id: string
  title: string
  /** Lien public (watch ou shorts selon le format). */
  url: string
  thumbnailUrl: string
  /** Date de publication ISO, null si YouTube ne l'expose pas. */
  publishedAt: string | null
  isShort: boolean
}
