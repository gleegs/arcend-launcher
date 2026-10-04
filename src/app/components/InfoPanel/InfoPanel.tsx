import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { ArrowRight, Users, Map, Maximize2, Minimize2, Boxes } from 'lucide-react'
import { useArcStore } from '../../store/arc'
import { useLogStore } from '../../store/log'
import { useProgressStore } from '../../store/progress'
import { useModpackVersionStore, isModpackUpdatePending } from '../../store/modpackVersion'
import LogRow from '../LogRow/LogRow'
import { isProposalArc } from '../../lib/proposalArc'
import type { LatestArticle } from '../../../electron/types/article'
import type { ServerStatus } from '../../../electron/types/server'

type TabId = 'article' | 'serveur' | 'logs'

const TABS: { id: TabId; label: string }[] = [
  { id: 'article', label: 'Dernier article' },
  { id: 'serveur', label: 'Serveur' },
  { id: 'logs', label: 'Logs' },
]

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long' })

function formatArcDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

function computeArcProgress(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const startTime = new Date(start).getTime()
  const endTime = new Date(end).getTime()
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) return 0
  const ratio = (Date.now() - startTime) / (endTime - startTime)
  return Math.min(100, Math.max(0, ratio * 100))
}

export default function InfoPanel() {
  const [tab, setTab] = useState<TabId>('article')
  const [article, setArticle] = useState<LatestArticle | null>(null)
  const [logsExpanded, setLogsExpanded] = useState(false)
  const selectedArc = useArcStore((s) => s.selectedArc)
  const logs = useLogStore((s) => s.logs)
  const launchStatus = useProgressStore((s) => s.launch.status)
  const serverRelease = useModpackVersionStore((s) => s.serverRelease)
  const installedRelease = useModpackVersionStore((s) => s.installedRelease)
  const modpackInstalled = useModpackVersionStore((s) => s.installed)
  const [server, setServer] = useState<ServerStatus | null>(null)

  const progress = computeArcProgress(selectedArc?.startDate ?? null, selectedArc?.endDate ?? null)

  // Les arcs « à proposer » n'ont que l'onglet Dernier article (pas Serveur ni Logs).
  const isProposal = isProposalArc(selectedArc?.slug)
  const tabs = isProposal ? TABS.filter((t) => t.id === 'article') : TABS
  // Onglet réellement affiché (forcé sur « article » pour les arcs à proposer).
  const activeTab: TabId = isProposal ? 'article' : tab

  // Auto-scroll des logs vers le bas quand de nouvelles entrées arrivent
  // (sauf si l'utilisateur a remonté pour lire l'historique).
  const logsRef = useRef<HTMLDivElement>(null)
  const logsAtBottomRef = useRef(true)
  const handleLogsScroll = () => {
    const el = logsRef.current
    if (!el) return
    logsAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }
  useEffect(() => {
    if (activeTab !== 'logs') return
    const el = logsRef.current
    if (el && logsAtBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs, activeTab, logsExpanded])

  useEffect(() => {
    window.electronAPI
      .articleFetchLatest()
      .then((res) => {
        if (res.ok && res.data) {
          setArticle(res.data)
          // Précharge l'image pour qu'elle soit déjà en cache à l'ouverture
          // de l'onglet (évite le chargement visible).
          if (res.data.image) {
            const img = new Image()
            img.src = res.data.image
          }
        }
      })
      .catch(() => undefined)
  }, [])

  // Le statut serveur est rafraîchi toutes les 30 s, mais on suspend le polling
  // pendant toute la session de jeu (préparation du lancement jusqu'à « running »)
  // car le launcher n'est plus actif. Il reprend quand le jeu se ferme (« closed »)
  // et que le launcher réapparaît.
  const gameActive =
    launchStatus !== 'idle' && launchStatus !== 'closed' && launchStatus !== 'error'

  useEffect(() => {
    if (gameActive) return
    const fetchServer = () =>
      window.electronAPI
        .serverFetchStatus()
        .then((res) => {
          if (res.ok && res.data) setServer(res.data)
        })
        .catch(() => undefined)
    fetchServer()
    const id = setInterval(fetchServer, 30_000)
    return () => clearInterval(id)
  }, [gameActive])

  const online = server?.online ?? false
  const playerCount = server?.players ?? 0

  return (
    <div
      className={clsx(
        'transition-[width] duration-300 ease-out',
        activeTab === 'logs' && logsExpanded ? 'w-[680px]' : 'w-[400px]'
      )}
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      {/* Tabs */}
      <div className="flex">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'px-4 py-2 text-[12px] font-black uppercase cursor-pointer transition-colors duration-200',
              i === 0 && 'rounded-tl-[8px]',
              i === tabs.length - 1 && 'rounded-tr-[8px]',
              i < tabs.length - 1 && 'border-r border-black',
              activeTab === t.id
                ? 'bg-white text-black'
                : 'bg-white/40 text-black/60 hover:bg-white/60'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div
        className={clsx(
          'relative -mt-px overflow-hidden rounded-[4px] rounded-tl-none p-3 shadow-glass-lg transition-[height] duration-300 ease-out',
          activeTab === 'logs' && logsExpanded
            ? 'h-[440px]'
            : activeTab === 'serveur'
              ? 'h-[196px]'
              : 'h-[156px]',
          activeTab === 'logs' ? 'bg-black text-white' : 'bg-white text-black'
        )}
      >
        {activeTab === 'serveur' && (
          <div className="flex h-full flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[16px] font-black uppercase leading-none">
                {playerCount} Joueurs
                <Users width={16} height={16} />
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase text-black/50">Connectés</div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-[16px] font-black uppercase leading-none">
                {online ? 'En ligne' : 'Hors ligne'}
                <span
                  className={clsx(
                    'inline-block h-2.5 w-2.5 rounded-full',
                    online && 'animate-pulse'
                  )}
                  style={{ backgroundColor: online ? 'var(--color-green)' : '#dc2626' }}
                />
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase text-black/50">
                Statut du serveur
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-[16px] font-black uppercase leading-none">
                Modpack {serverRelease ?? '—'}
                <Boxes width={16} height={16} />
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase text-black/50">
                {!modpackInstalled && !selectedArc?.installed
                  ? 'Non installé'
                  : isModpackUpdatePending({
                        installed: modpackInstalled || Boolean(selectedArc?.installed),
                        serverRelease,
                        installedRelease,
                      })
                    ? `Installé ${installedRelease ?? '—'} · mise à jour au prochain lancement`
                    : serverRelease
                      ? 'À jour'
                      : `Installé ${installedRelease ?? '—'}`}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-[16px] font-black uppercase leading-none">
                Progression de l&apos;arc
                <Map width={16} height={16} />
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/15">
                <div
                  className="h-full rounded-full bg-black"
                  style={{ width: `${progress}%`, transition: 'width 300ms ease-out' }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] font-bold uppercase">
                <span>{formatArcDate(selectedArc?.startDate ?? null)}</span>
                <span>{formatArcDate(selectedArc?.endDate ?? null)}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'article' &&
          (article ? (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group absolute inset-0 block overflow-hidden rounded-[4px] rounded-tl-none"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              {article.image && (
                <img
                  src={article.image}
                  alt=""
                  className="cover-fade-in absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to bottom, rgba(21,16,19,0) 60%, rgba(21,16,19,0.6) 80%)',
                }}
              />
              <div className="absolute inset-0 flex items-end justify-between gap-3 p-3 text-white">
                <h3 className="line-clamp-2 text-[16px] font-black uppercase leading-tight">
                  {article.title}
                </h3>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-black border-2 border-transparent transition-all duration-250 group-hover:scale-110">
                  <ArrowRight width={14} height={14} />
                </span>
              </div>
            </a>
          ) : (
            <div className="flex h-full items-center justify-center text-xs font-bold uppercase text-black/40">
              Aucun article
            </div>
          ))}

        {activeTab === 'logs' && (
          <button
            type="button"
            onClick={() => setLogsExpanded((v) => !v)}
            className="absolute right-4 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black cursor-pointer border-2 border-transparent hover:border-white hover:scale-110 transition-all duration-250"
            aria-label={logsExpanded ? 'Réduire les logs' : 'Agrandir les logs'}
          >
            {logsExpanded ? (
              <Minimize2 width={12} height={12} />
            ) : (
              <Maximize2 width={12} height={12} />
            )}
          </button>
        )}

        {activeTab === 'logs' && (
          <div
            ref={logsRef}
            onScroll={handleLogsScroll}
            className="console-scroll -mr-[5px] h-full select-text overflow-y-auto font-mono text-[11px]"
          >
            {logs.length === 0 ? (
              <div className="px-2 py-0.5 text-xs text-white/60">Aucun log</div>
            ) : (
              <div className="cursor-text">
                {logs.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
