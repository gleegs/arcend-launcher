import fs from 'node:fs'
import path from 'node:path'

/**
 * Version du reset des réglages graphiques.
 *
 * Incrémentez cette valeur ("v1" -> "v2" -> …) pour repousser une fois les
 * réglages graphiques par défaut chez TOUS les joueurs lors d'un prochain
 * déploiement du launcher.
 */
export const GRAPHICS_RESET_VERSION = 'v1'

/**
 * Réglages graphiques par défaut d'Arcend (tuning perfs, notamment dans les
 * zones construites). Répartis sur trois fichiers car Minecraft/les mods les
 * stockent séparément :
 *  - options.txt        : options vanilla (particules, distance d'entités…)
 *  - iris.properties    : distance d'ombre des shaders
 *  - voxy-config.json   : rendu longue distance Voxy
 */
const OPTIONS_TXT: Record<string, string> = {
  particles: '1', // Décroissante
  entityDistanceScaling: '0.75',
  betterBiomeBlendRadius: '8',
  biomeBlendRadius: '2',
  graphicsMode: '1', // Détaillé
  mipmapLevels: '4',
  entityShadows: 'true',
  renderDistance: '12',
}
// Uniquement la distance d'ombre : on ne touche NI à enableShaders NI au shaderPack
// choisi par le joueur.
const IRIS_PROPERTIES: Record<string, string> = {
  maxShadowRenderDistance: '12',
}
const VOXY_CONFIG: Record<string, unknown> = {
  enabled: true,
  section_render_distance: 3.9375, // ~126 blocs
}

export type GraphicsMigrationResult =
  | { status: 'skipped'; details: string }
  | { status: 'fresh'; details: string }
  | { status: 'applied'; changed: string[]; backups: string[] }

/**
 * Migration one-shot des réglages graphiques d'un arc.
 *
 * POURQUOI : Default Options applique le bon tuning aux NOUVEAUX joueurs, mais
 * pas à ceux qui ont déjà une config. Cette migration pousse le tuning UNE FOIS
 * chez les joueurs existants, puis ne les retouche plus (ils restent libres
 * d'ajuster). Même principe que keybindsMigration / blurMigration.
 *
 * Non destructif : on fusionne seulement les clés ciblées, tout le reste des
 * fichiers est conservé (touches, shader choisi, autres options…). Backups avant
 * modification. Idempotent via le marqueur.
 *
 * @param mcPath dossier `minecraft` de l'arc
 */
export function migrateGraphics(mcPath: string): GraphicsMigrationResult {
  const markerPath = path.join(mcPath, `.arcend_graphics_reset_${GRAPHICS_RESET_VERSION}`)

  if (fs.existsSync(markerPath)) {
    return { status: 'skipped', details: 'déjà migré' }
  }

  const optionsPath = path.join(mcPath, 'options.txt')
  // Nouveau joueur : pas de options.txt encore -> Default Options s'en charge.
  if (!fs.existsSync(optionsPath)) {
    writeMarker(markerPath)
    return { status: 'fresh', details: 'pas de options.txt' }
  }

  const changed: string[] = []
  const backups: string[] = []
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  const backup = (p: string) => {
    const b = `${p}.bak-graphics-${stamp}`
    fs.copyFileSync(p, b)
    backups.push(path.basename(b))
  }

  // --- fichiers "clé<sep>valeur" ligne par ligne (options.txt: ':' ; iris: '=') ---
  const mergeLines = (p: string, sep: string, kv: Record<string, string>) => {
    if (!fs.existsSync(p)) return
    const raw = fs.readFileSync(p, 'utf8')
    const eol = raw.includes('\r\n') ? '\r\n' : '\n'
    const hadTrailing = /\r?\n$/.test(raw)
    const lines = raw.split(/\r?\n/)
    if (hadTrailing && lines[lines.length - 1] === '') lines.pop()

    const remaining = new Set(Object.keys(kv))
    let touched = false
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([A-Za-z0-9_]+)/)
      if (m && remaining.has(m[1]) && lines[i].startsWith(m[1] + sep)) {
        const next = `${m[1]}${sep}${kv[m[1]]}`
        if (lines[i] !== next) {
          lines[i] = next
          touched = true
        }
        remaining.delete(m[1])
      }
    }
    for (const k of remaining) {
      lines.push(`${k}${sep}${kv[k]}`)
      touched = true
    }

    if (!touched) return
    backup(p)
    const out = lines.join(eol) + (hadTrailing ? eol : '')
    const tmp = `${p}.tmp`
    fs.writeFileSync(tmp, out)
    fs.renameSync(tmp, p)
    changed.push(path.basename(p))
  }

  // --- voxy-config.json : fusion JSON ---
  const mergeJson = (p: string, kv: Record<string, unknown>) => {
    if (!fs.existsSync(p)) return
    let json: Record<string, unknown>
    try {
      json = JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch {
      return // config corrompue : on ne risque rien
    }
    let touched = false
    for (const [k, v] of Object.entries(kv)) {
      if (json[k] !== v) {
        json[k] = v
        touched = true
      }
    }
    if (!touched) return
    backup(p)
    const tmp = `${p}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(json, null, 2) + '\n')
    fs.renameSync(tmp, p)
    changed.push(path.basename(p))
  }

  mergeLines(optionsPath, ':', OPTIONS_TXT)
  mergeLines(path.join(mcPath, 'config', 'iris.properties'), '=', IRIS_PROPERTIES)
  mergeJson(path.join(mcPath, 'config', 'voxy-config.json'), VOXY_CONFIG)

  writeMarker(markerPath)
  return { status: 'applied', changed, backups }
}

function writeMarker(markerPath: string): void {
  fs.writeFileSync(
    markerPath,
    `Reset des réglages graphiques Arcend (${GRAPHICS_RESET_VERSION}) effectué le ${new Date().toISOString()}.\n` +
      `Ne pas supprimer : évite de réappliquer les réglages à chaque lancement.\n`
  )
}
