import fs from 'node:fs'
import { app } from 'electron'
import type { RemoteArc } from '../types/arc'

/**
 * Arcs de développement : en mode DEV uniquement (`!app.isPackaged`), la
 * variable d'environnement `ARCEND_DEV_ARCS_FILE` pointe vers un fichier JSON
 * (tableau d'arcs au format `RemoteArc`) ajouté aux arcs Supabase. Permet de
 * tester un nouvel arc de bout en bout (sidebar, installation, lancement) sans
 * l'insérer dans Supabase, où il serait visible par tous les joueurs.
 * Ignoré en build packagé.
 */
export function loadDevArcs(): RemoteArc[] {
  const file = process.env.ARCEND_DEV_ARCS_FILE
  if (!file || app.isPackaged) return []

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (!Array.isArray(parsed)) {
      console.warn(`[devArcs] ${file} doit contenir un tableau d'arcs`)
      return []
    }
    return parsed
      .filter((arc): arc is Partial<RemoteArc> & { slug: string } => {
        return typeof arc === 'object' && arc !== null && typeof arc.slug === 'string'
      })
      .map(toRemoteArc)
  } catch (error) {
    console.warn(`[devArcs] lecture de ${file} impossible :`, error)
    return []
  }
}

function toRemoteArc(arc: Partial<RemoteArc> & { slug: string }): RemoteArc {
  return {
    slug: arc.slug,
    name: arc.name ?? null,
    description: arc.description ?? null,
    version: arc.version ?? null,
    startDate: arc.startDate ?? null,
    endDate: arc.endDate ?? null,
    mcVersion: arc.mcVersion ?? null,
    javaVersion: arc.javaVersion ?? null,
    loader: arc.loader ?? null,
    loaderVersion: arc.loaderVersion ?? null,
    loaderInstallUrl: arc.loaderInstallUrl ?? null,
    modpackUrl: arc.modpackUrl ?? null,
    coverUrl: arc.coverUrl ?? null,
    thumbnailUrl: arc.thumbnailUrl ?? null,
    logoUrl: arc.logoUrl ?? null,
    createdAt: arc.createdAt ?? new Date(0).toISOString(),
    mapUrl: arc.mapUrl ?? null,
    mapExtractedSizeBytes: arc.mapExtractedSizeBytes ?? null,
    mapSha256: arc.mapSha256 ?? null,
    serverHost: arc.serverHost ?? null,
    serverPort: arc.serverPort ?? null,
  }
}

/** Ajoute les arcs de dev aux arcs Supabase (un arc de dev remplace l'arc de même slug). */
export function withDevArcs(arcs: RemoteArc[]): RemoteArc[] {
  const devArcs = loadDevArcs()
  if (devArcs.length === 0) return arcs
  const devSlugs = new Set(devArcs.map((arc) => arc.slug))
  return [...devArcs, ...arcs.filter((arc) => !devSlugs.has(arc.slug))]
}
