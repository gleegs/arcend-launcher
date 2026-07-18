import fs from 'node:fs'
import path from 'node:path'

/**
 * Version du reset du flou des menus.
 *
 * Incrémentez cette valeur ("v1" -> "v2" -> …) pour reforcer une fois le flou à 0
 * chez TOUS les joueurs lors d'un prochain déploiement du launcher.
 */
export const BLUR_RESET_VERSION = 'v1'

/** Option Minecraft du flou d'arrière-plan des menus (0 = désactivé). */
const BLUR_KEY = 'menuBackgroundBlurriness'

export type BlurMigrationResult =
  | { status: 'skipped'; details: string }
  | { status: 'fresh'; details: string }
  | { status: 'set'; previous: string | null; backupPath: string }

/**
 * Migration one-shot du flou des menus d'un arc.
 *
 * POURQUOI : bug connu Iris + flou des menus sur NeoForge 1.21.1 — quand le flou
 * (`menuBackgroundBlurriness`) est activé, l'écran de sélection des shaders d'Iris
 * s'affiche vide/invisible EN JEU (il masque la liste). Le pack met déjà le flou à
 * 0 par défaut (Default Options), mais Default Options ne corrige PAS les joueurs
 * existants : ceux qui ont déjà un `options.txt` gardent leur flou et donc le bug.
 *
 * CE QUE FAIT LA MIGRATION (une seule fois par joueur, par version) :
 *   1. Sauvegarde `options.txt`.
 *   2. Force `menuBackgroundBlurriness:0` (remplace la ligne, ou l'ajoute si
 *      absente). Tout le reste est conservé intact.
 *   3. Pose un fichier marqueur pour ne JAMAIS refaire l'opération.
 *
 * Après ce reset unique, le joueur est libre de réactiver le flou s'il le souhaite
 * (au prix du bug shader) : on ne le réécrira plus jamais pour cette version.
 *
 * Idempotent et non destructif hors la ligne du flou. À appeler avant le démarrage
 * du jeu (l'ordre vis-à-vis de la synchro packwiz n'est pas critique : la migration
 * ne touche que `options.txt`, jamais géré par packwiz).
 *
 * @param mcPath dossier `minecraft` de l'arc (ex: `<arcPath>/minecraft`)
 */
export function migrateBlur(mcPath: string): BlurMigrationResult {
  const optionsPath = path.join(mcPath, 'options.txt')
  const markerPath = path.join(mcPath, `.arcend_blur_reset_${BLUR_RESET_VERSION}`)

  // Déjà fait pour ce joueur/cette version : on ne touche à rien.
  if (fs.existsSync(markerPath)) {
    return { status: 'skipped', details: 'déjà migré' }
  }

  // Pas de options.txt = nouveau joueur : Default Options posera le flou à 0 tout
  // seul au premier lancement. On pose juste le marqueur.
  if (!fs.existsSync(optionsPath)) {
    writeMarker(markerPath)
    return { status: 'fresh', details: 'pas de options.txt' }
  }

  // Backup horodaté du fichier complet.
  const raw = fs.readFileSync(optionsPath, 'utf8')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(mcPath, `options.txt.bak-blur-${stamp}`)
  fs.writeFileSync(backupPath, raw)

  // On force uniquement la ligne du flou à 0 (remplacement ou ajout).
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const hadTrailingEmpty = lines.length > 0 && lines[lines.length - 1] === ''
  const body = hadTrailingEmpty ? lines.slice(0, -1) : lines

  let previous: string | null = null
  const withoutBlur = body.filter((line) => {
    if (line.startsWith(`${BLUR_KEY}:`)) {
      previous = line.slice(BLUR_KEY.length + 1)
      return false
    }
    return true
  })
  withoutBlur.push(`${BLUR_KEY}:0`)
  const out = withoutBlur.join(eol) + (hadTrailingEmpty ? eol : '')

  // Écriture atomique (tmp puis rename) pour éviter tout fichier corrompu.
  const tmpPath = `${optionsPath}.tmp`
  fs.writeFileSync(tmpPath, out)
  fs.renameSync(tmpPath, optionsPath)

  // Marqueur : ne plus jamais refaire pour cette version.
  writeMarker(markerPath)

  return { status: 'set', previous, backupPath }
}

function writeMarker(markerPath: string): void {
  fs.writeFileSync(
    markerPath,
    `Reset du flou des menus Arcend (${BLUR_RESET_VERSION}) effectué le ${new Date().toISOString()}.\n` +
      `Ne pas supprimer : évite de forcer le flou à 0 à chaque lancement.\n`
  )
}
