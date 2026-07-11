import fs from 'node:fs'
import path from 'node:path'

/**
 * Version du reset des touches.
 *
 * Incrémentez cette valeur ("v1" -> "v2" -> …) pour reforcer un reset global des
 * touches chez TOUS les joueurs lors d'un prochain déploiement du launcher.
 */
export const KEYBINDS_RESET_VERSION = 'v1'

export type KeybindsMigrationResult =
  | { status: 'skipped'; details: string }
  | { status: 'fresh'; details: string }
  | { status: 'reset'; removed: number; backupPath: string }

/**
 * Migration one-shot des touches (keybinds) d'un arc.
 *
 * POURQUOI : le mod "Better Options" a écrit un keymap parasite dans le
 * `options.txt` de chaque joueur. Une fois Better Options retiré, Default
 * Options ne corrige PAS les joueurs existants — il ne réécrit jamais une touche
 * déjà "personnalisée". Les joueurs qui ont déjà lancé le jeu gardent donc les
 * mauvaises touches à vie.
 *
 * CE QUE FAIT LA MIGRATION (une seule fois par joueur, par version) :
 *   1. Sauvegarde `options.txt`.
 *   2. Supprime UNIQUEMENT les lignes `key_*` (les touches). Tout le reste
 *      (graphismes, son, langue, resource packs…) est conservé intact.
 *   3. Pose un fichier marqueur pour ne JAMAIS refaire l'opération.
 *
 * Au démarrage suivant du jeu, Minecraft régénère les lignes `key_` manquantes à
 * leur valeur d'usine, puis Default Options réapplique par-dessus le
 * `config/defaultoptions/keybindings.txt` du pack. Ensuite le joueur reconfigure
 * librement, pour toujours.
 *
 * Idempotent et non destructif hors lignes `key_`. À appeler avant le démarrage
 * du jeu (l'ordre vis-à-vis de la synchro packwiz n'est pas critique : la
 * migration ne touche que `options.txt`, jamais géré par packwiz).
 *
 * @param mcPath dossier `minecraft` de l'arc (ex: `<arcPath>/minecraft`)
 */
export function migrateKeybinds(mcPath: string): KeybindsMigrationResult {
  const optionsPath = path.join(mcPath, 'options.txt')
  const markerPath = path.join(mcPath, `.arcend_keybinds_reset_${KEYBINDS_RESET_VERSION}`)

  // Déjà fait pour ce joueur/cette version : on ne touche à rien.
  if (fs.existsSync(markerPath)) {
    return { status: 'skipped', details: 'déjà migré' }
  }

  // Pas de options.txt = nouveau joueur : Default Options mettra les bons défauts
  // tout seul au premier lancement. On pose juste le marqueur.
  if (!fs.existsSync(optionsPath)) {
    writeMarker(markerPath)
    return { status: 'fresh', details: 'pas de options.txt' }
  }

  // Backup horodaté du fichier complet.
  const raw = fs.readFileSync(optionsPath, 'utf8')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(mcPath, `options.txt.bak-keybinds-${stamp}`)
  fs.writeFileSync(backupPath, raw)

  // On retire uniquement les lignes de touches (elles commencent par "key_").
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const kept = lines.filter((line) => !line.startsWith('key_'))
  const removed = lines.length - kept.length

  // Écriture atomique (tmp puis rename) pour éviter tout fichier corrompu.
  const tmpPath = `${optionsPath}.tmp`
  fs.writeFileSync(tmpPath, kept.join(eol))
  fs.renameSync(tmpPath, optionsPath)

  // Marqueur : ne plus jamais refaire pour cette version.
  writeMarker(markerPath)

  return { status: 'reset', removed, backupPath }
}

function writeMarker(markerPath: string): void {
  fs.writeFileSync(
    markerPath,
    `Reset des touches Arcend (${KEYBINDS_RESET_VERSION}) effectué le ${new Date().toISOString()}.\n` +
      `Ne pas supprimer : évite de réinitialiser les touches à chaque lancement.\n`
  )
}
