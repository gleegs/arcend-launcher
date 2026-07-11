import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateKeybinds, KEYBINDS_RESET_VERSION } from './keybindsMigration'

const MARKER = `.arcend_keybinds_reset_${KEYBINDS_RESET_VERSION}`

const SAMPLE_OPTIONS = [
  'version:3955',
  'graphicsMode:1',
  'guiScale:3',
  'lang:fr_fr',
  'key_key.forward:key.keyboard.w',
  'key_key.accessorify.open_widget:key.keyboard.x',
  'key_key.accessorify.open_ender_chest:key.keyboard.v',
  'soundCategory_master:0.5',
].join('\n')

let mcPath: string

beforeEach(() => {
  mcPath = fs.mkdtempSync(path.join(os.tmpdir(), 'arcend-keybinds-'))
})

afterEach(() => {
  fs.rmSync(mcPath, { recursive: true, force: true })
})

describe('migrateKeybinds', () => {
  it('retire les lignes key_ et conserve le reste, avec backup + marqueur', () => {
    const optionsPath = path.join(mcPath, 'options.txt')
    fs.writeFileSync(optionsPath, SAMPLE_OPTIONS)

    const res = migrateKeybinds(mcPath)

    expect(res.status).toBe('reset')
    if (res.status === 'reset') {
      expect(res.removed).toBe(3)
      expect(fs.existsSync(res.backupPath)).toBe(true)
      // Le backup contient bien le fichier d'origine intact.
      expect(fs.readFileSync(res.backupPath, 'utf8')).toBe(SAMPLE_OPTIONS)
    }

    const result = fs.readFileSync(optionsPath, 'utf8')
    expect(result).not.toMatch(/^key_/m)
    expect(result).toContain('graphicsMode:1')
    expect(result).toContain('lang:fr_fr')
    expect(result).toContain('soundCategory_master:0.5')
    expect(fs.existsSync(path.join(mcPath, MARKER))).toBe(true)
  })

  it('ne refait rien si le marqueur existe déjà (idempotent)', () => {
    const optionsPath = path.join(mcPath, 'options.txt')
    fs.writeFileSync(optionsPath, SAMPLE_OPTIONS)
    fs.writeFileSync(path.join(mcPath, MARKER), 'done')

    const res = migrateKeybinds(mcPath)

    expect(res.status).toBe('skipped')
    // options.txt inchangé, toujours ses lignes key_.
    expect(fs.readFileSync(optionsPath, 'utf8')).toBe(SAMPLE_OPTIONS)
  })

  it('pose juste le marqueur pour un nouveau joueur (pas de options.txt)', () => {
    const res = migrateKeybinds(mcPath)

    expect(res.status).toBe('fresh')
    expect(fs.existsSync(path.join(mcPath, MARKER))).toBe(true)
    expect(fs.existsSync(path.join(mcPath, 'options.txt'))).toBe(false)
  })

  it('préserve les fins de ligne CRLF', () => {
    const optionsPath = path.join(mcPath, 'options.txt')
    fs.writeFileSync(optionsPath, 'graphicsMode:1\r\nkey_key.forward:key.keyboard.w\r\nguiScale:3')

    migrateKeybinds(mcPath)

    const result = fs.readFileSync(optionsPath, 'utf8')
    expect(result).toBe('graphicsMode:1\r\nguiScale:3')
  })
})
