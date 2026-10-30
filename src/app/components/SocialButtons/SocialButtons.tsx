import { useEffect, useState, type CSSProperties } from 'react'
import { Globe, Play } from 'lucide-react'
import DiscordIcon from '../DiscordIcon/DiscordIcon'
import HoverLabel, { LABEL_CLASS } from '../HoverLabel/HoverLabel'
import { useArcStore } from '../../store/arc'
import { useLogStore } from '../../store/log'
import type { LatestYoutubeVideo } from '../../../electron/types/youtube'

const DISCORD_URL = 'https://discord.gg/Pt4EQjN2gm'
const WEBSITE_URL = 'https://www.arcend.fr'
const YOUTUBE_URL = 'https://www.youtube.com/@arcendmc'

const YOUTUBE_REFRESH_MS = 30 * 60 * 1000

// Dernier short déjà ouvert : la pastille « Nouveau » disparaît au clic et revient
// au prochain short publié.
const SEEN_VIDEO_KEY = 'arcend.socials.seenVideo'

// Pastille « Nouveau » aux couleurs de l'arc sélectionné (dégradés du site) ;
// --pulse-color = couleur de l'onde du pulse (cf. .new-badge-pulse dans index.css).
type BadgeStyle = CSSProperties & { '--pulse-color': string }
const NEW_BADGE_STYLES: Record<string, BadgeStyle> = {
  'arcend-horror': {
    background: 'linear-gradient(90deg, #990003 0%, #B20003 49%, #2E0001 94%)',
    color: '#FFF0E6',
    '--pulse-color': 'rgba(229, 20, 28, 0.6)',
  },
  'arcend-prologue': {
    background:
      'linear-gradient(90deg, #E6852C 0%, #E76314 15%, #EB4609 46%, #F2033E 56%, #E70194 68%, #BA2DFF 82%, #3661FF 100%)',
    color: '#FFF0E6',
    '--pulse-color': 'rgba(186, 45, 255, 0.6)',
  },
}
const DEFAULT_BADGE_STYLE: BadgeStyle = {
  background: '#FFF0E6',
  color: '#151013',
  '--pulse-color': 'rgba(255, 240, 230, 0.6)',
}

const linkClassName =
  'bg-black rounded-full cursor-pointer border border-transparent hover:border-white transition-colors duration-250 shadow-button p-2'

const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

function formatPublished(iso: string | null): string | null {
  const time = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(time)) return null
  const minutes = Math.round((time - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return relativeFormat.format(days, 'day')
  return relativeFormat.format(Math.round(days / 30), 'month')
}

/**
 * Miniature verticale du dernier short, au survol, à gauche des boutons et centrée
 * sur la colonne (positionnée par rapport à elle, pas au bouton).
 */
function VideoPreview({ video, onOpen }: { video: LatestYoutubeVideo; onOpen: () => void }) {
  const published = formatPublished(video.publishedAt)
  return (
    // Bord droit aligné sur les boutons (p-8 de la colonne) et pr-3 plutôt qu'une
    // marge : la zone reste survolée entre le bouton et la carte.
    <div className="pointer-events-none absolute right-[calc(100%-2rem)] top-1/2 origin-right -translate-y-1/2 translate-x-4 scale-90 pr-3 opacity-0 blur-sm transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100 group-hover:blur-none">
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
        className="relative block aspect-[9/16] w-[150px] overflow-hidden rounded-[4px] bg-black shadow-glass-lg"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        <span className={`${LABEL_CLASS} absolute left-2 top-2`}>Dernière vidéo</span>
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/50 to-transparent px-2.5 pb-2.5 pt-10 text-white">
          <div className="line-clamp-3 text-[11px] font-black uppercase leading-tight">
            {video.title}
          </div>
          {published && (
            <div className="mt-1 text-[10px] font-bold uppercase text-white/60">{published}</div>
          )}
        </div>
      </a>
    </div>
  )
}

export default function SocialButtons() {
  const arcSlug = useArcStore((s) => s.selectedArc?.slug)
  const [latestVideo, setLatestVideo] = useState<LatestYoutubeVideo | null>(null)
  const [seenVideoId, setSeenVideoId] = useState(() => localStorage.getItem(SEEN_VIDEO_KEY))

  useEffect(() => {
    // Absent si le process principal tourne encore sur une version sans ce canal
    // (rechargement à chaud du renderer en dev) : pas d'aperçu, le bouton reste.
    if (typeof window.electronAPI.youtubeFetchLatest !== 'function') {
      useLogStore
        .getState()
        .add('Aperçu YouTube indisponible : redémarre complètement le launcher.', 'warn')
      return
    }
    const load = () =>
      window.electronAPI
        .youtubeFetchLatest()
        .then((res) => {
          if (!res.ok) {
            useLogStore.getState().add(`Aperçu YouTube : ${res.error}`, 'warn')
            return
          }
          if (!res.data) return
          // Précharge la miniature pour que la carte s'affiche d'un coup au survol.
          new Image().src = res.data.thumbnailUrl
          setLatestVideo(res.data)
        })
        .catch(() => setLatestVideo(null))
    load()
    const id = setInterval(load, YOUTUBE_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const markSeen = () => {
    if (!latestVideo) return
    localStorage.setItem(SEEN_VIDEO_KEY, latestVideo.id)
    setSeenVideoId(latestVideo.id)
  }

  const isNew = Boolean(latestVideo && seenVideoId !== latestVideo.id)
  const badgeStyle = (arcSlug && NEW_BADGE_STYLES[arcSlug]) || DEFAULT_BADGE_STYLE

  return (
    <div className="gap-3 absolute top-1/2 -translate-y-1/2 right-0 p-8 flex flex-col">
      <div className="group flex">
        {latestVideo && <VideoPreview video={latestVideo} onOpen={markSeen} />}
        <div className="group/label relative flex">
          {/* Avec un aperçu, l'étiquette est sur la carte (sinon elle la chevaucherait). */}
          {!latestVideo && <HoverLabel>Dernière vidéo</HoverLabel>}
          {isNew && (
            <span
              className="new-badge-pulse pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-2 group-hover:scale-75 group-hover:opacity-0"
              style={badgeStyle}
            >
              Nouveau
            </span>
          )}
          <a
            href={latestVideo?.url ?? YOUTUBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markSeen}
            className={linkClassName}
            style={{ WebkitAppRegion: 'no-drag' }}
            aria-label="Dernière vidéo"
          >
            <Play color="#fff" />
          </a>
        </div>
      </div>
      <div className="group/label relative flex">
        <HoverLabel>Site web</HoverLabel>
        <a
          href={WEBSITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <Globe color="#fff" />
        </a>
      </div>
      <div className="group/label relative flex">
        <HoverLabel>Discord</HoverLabel>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <DiscordIcon color="#fff" />
        </a>
      </div>
    </div>
  )
}
