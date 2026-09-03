import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { remoteArcsCachePath, cacheDir } from '../lib/paths'
import { isActiveArc } from '../types/arc'
import type { RemoteArc } from '../types/arc'

interface SupabaseArcRow {
  slug: string
  name: string | null
  description: string | null
  version: string | null
  start_date: string | null
  end_date: string | null
  mc_version: string | null
  java_version: string | null
  loader: string | null
  loader_version: string | null
  loader_install_url: string | null
  modpack_url: string | null
  cover_url: string[] | null
  thumbnail_url: string | null
  logo_url: string | null
  created_at: string
  map_url: string | null
  map_extracted_size_bytes: number | null
  map_sha256: string | null
}

function toRemoteArc(row: SupabaseArcRow): RemoteArc {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.version,
    startDate: row.start_date,
    endDate: row.end_date,
    mcVersion: row.mc_version,
    javaVersion: row.java_version,
    loader: row.loader,
    loaderVersion: row.loader_version,
    loaderInstallUrl: row.loader_install_url,
    modpackUrl: row.modpack_url,
    coverUrl: row.cover_url,
    thumbnailUrl: row.thumbnail_url,
    logoUrl: row.logo_url,
    createdAt: row.created_at,
    mapUrl: row.map_url ?? null,
    mapExtractedSizeBytes: row.map_extracted_size_bytes ?? null,
    mapSha256: row.map_sha256 ?? null,
  }
}

let client: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (client) return client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY doivent être définis dans .env')
  }

  client = createClient(url, key)
  return client
}

async function fetchArcsFromApi(): Promise<RemoteArc[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('arcs')
    .select('*')
    .order('start_date', { ascending: false })

  if (error) {
    throw new Error(`Supabase fetch error: ${error.message}`)
  }

  return (data ?? []).map(toRemoteArc)
}

interface RemoteArcsCache {
  fetchedAt: string
  arcs: RemoteArc[]
}

function readCache(): RemoteArc[] | null {
  try {
    if (!fs.existsSync(remoteArcsCachePath)) return null
    const raw = fs.readFileSync(remoteArcsCachePath, 'utf-8')
    const parsed = JSON.parse(raw) as RemoteArcsCache | RemoteArc[]
    // Ancien format (plain array) encore accepté à la lecture.
    return Array.isArray(parsed) ? parsed : parsed.arcs
  } catch {
    return null
  }
}

function writeCache(arcs: RemoteArc[]): void {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  const cache: RemoteArcsCache = { fetchedAt: new Date().toISOString(), arcs }
  fs.writeFileSync(remoteArcsCachePath, JSON.stringify(cache, null, 2), 'utf-8')
}

export async function fetchArcsWithCache(): Promise<RemoteArc[]> {
  try {
    const arcs = await fetchArcsFromApi()
    writeCache(arcs)
    return arcs
  } catch {
    const cached = readCache()
    return cached ?? []
  }
}

export async function fetchActiveArc(): Promise<RemoteArc | null> {
  const arcs = await fetchArcsWithCache()
  return arcs.find(isActiveArc) ?? null
}

/**
 * Résout un arc remote par slug (network-first avec fallback cache offline).
 * Utilisé au lancement pour rafraîchir les URLs volatiles (modpack, map) :
 * le registre local ne doit jamais être la seule source d'une URL.
 */
export async function fetchRemoteArc(arcId: string): Promise<RemoteArc | null> {
  const arcs = await fetchArcsWithCache()
  return arcs.find((arc) => arc.slug === arcId) ?? null
}
