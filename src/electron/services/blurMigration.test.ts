import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateBlur, BLUR_RESET_VERSION } from './blurMigration'

const MARKER = `.arcend_blur_reset_${BLUR_RESET_VERSION}`

const SAMPLE_OPTIONS = [
  'version:3955',
  'graphicsMode:1',
  'menuBackgroundBlurriness:1',
  'lang:fr_fr',
  'soundCategory_master:0.5',
].join('\n')

let mcPath: string

beforeEach(() => {
  mcPath = fs.mkdtempSync(path.join(os.tmpdir(), 'arcend-blur-'))
})

afterEach(() => {
  fs.rmSync(mcPath, { recursive: true, force: true })
})

describe('migrateBlur', () => {
  it('force le flou à 0 et conserve le reste, avec backup + marqueur', () => {
    const optionsPath = path.join(mcPath, 'options.txt')
    fs.writeFileSync(optionsPath, SAMPLE_OPTIONS)

    const res = migrateBlur(mcPath)

    expect(res.status).toBe('set')
    if (res.status === 'set') {
      expect(res.previous).toBe('1')
      expect(fs.existsSync(res.backupPath)).toBe(true)
      expect(fs.readFileSync(res.backupPath, 'utf8')).toBe(SAMPLE_OPTIONS)
    }

    const result = fs.readFileSync(optionsPath, 'utf8')
    expect(result).toContain('menuBackgroundBlurriness:0')
    expect(result).not.toContain('menuBackgroundBlurriness:1')
    // une seule occurrence de la clé
    expect(result.match(/^menuBackgroundBlurriness:/gm)).toHaveLength(1)
    expect(result).toContain('graphicsMode:1')
    expect(result).toContain('lang:fr_fr')
    expect(fs.existsSync(path.join(mcPath, MARKER))).toBe(true)
  })

  it('ajoute la ligne si elle est absente', () => {
    const optionsPath = path.join(mcPath, 'options.txt')
    fs.writeFileSync(optionsPath, 'graphicsMode:1\nlang:fr_fr\n')

    const res = migrateBlur(mcPath)

    expect(res.status).toBe('set')
    if (res.status === 'set') expect(res.previous).toBeNull()
    const result = fs.readFileSync(optionsPath, 'utf8')
    expect(result).toContain('menuBackgroundBlurriness:0')
    expect(result).toContain('graphicsMode:1')
  })

  it('ne refait rien si le marqueur existe déjà (idempotent)', () => {
    const optionsPath = path.join(mcPath, 'options.txt')
    fs.writeFileSync(optionsPath, SAMPLE_OPTIONS)
    fs.writeFileSync(path.join(mcPath, MARKER), 'done')

    const res = migrateBlur(mcPath)

    expect(res.status).toBe('skipped')
    // options.txt inchangé, le joueur garde son flou.
    expect(fs.readFileSync(optionsPath, 'utf8')).toBe(SAMPLE_OPTIONS)
  })

  it('pose juste le marqueur pour un nouveau joueur (pas de options.txt)', () => {
    const res = migrateBlur(mcPath)

    expect(res.status).toBe('fresh')
    expect(fs.existsSync(path.join(mcPath, MARKER))).toBe(true)
    expect(fs.existsSync(path.join(mcPath, 'options.txt'))).toBe(false)
  })

  it('préserve les fins de ligne CRLF', () => {
    const optionsPath = path.join(mcPath, 'options.txt')
    fs.writeFileSync(optionsPath, 'graphicsMode:1\r\nmenuBackgroundBlurriness:1\r\nguiScale:3\r\n')

    migrateBlur(mcPath)

    const result = fs.readFileSync(optionsPath, 'utf8')
    expect(result).toBe('graphicsMode:1\r\nguiScale:3\r\nmenuBackgroundBlurriness:0\r\n')
  })
})
