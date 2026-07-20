import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateGraphics, GRAPHICS_RESET_VERSION } from './graphicsMigration'

const MARKER = `.arcend_graphics_reset_${GRAPHICS_RESET_VERSION}`

const SAMPLE_OPTIONS = [
  'version:3955',
  'particles:0',
  'entityDistanceScaling:1.0',
  'betterBiomeBlendRadius:14',
  'graphicsMode:1',
  'renderDistance:20',
  'key_key.forward:key.keyboard.w', // ne doit PAS être touché
  'lang:fr_fr',
].join('\n')

const SAMPLE_IRIS = [
  'enableShaders=true',
  'shaderPack=CompleUnbound.zip',
  'maxShadowRenderDistance=32',
].join('\n')

const SAMPLE_VOXY = JSON.stringify(
  { enabled: false, section_render_distance: 3.9375, service_threads: 10 },
  null,
  2
)

let mcPath: string

beforeEach(() => {
  mcPath = fs.mkdtempSync(path.join(os.tmpdir(), 'arcend-graphics-'))
  fs.mkdirSync(path.join(mcPath, 'config'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(mcPath, { recursive: true, force: true })
})

describe('migrateGraphics', () => {
  it('fusionne les réglages dans les 3 fichiers, conserve le reste, avec marqueur', () => {
    fs.writeFileSync(path.join(mcPath, 'options.txt'), SAMPLE_OPTIONS)
    fs.writeFileSync(path.join(mcPath, 'config', 'iris.properties'), SAMPLE_IRIS)
    fs.writeFileSync(path.join(mcPath, 'config', 'voxy-config.json'), SAMPLE_VOXY)

    const res = migrateGraphics(mcPath)

    expect(res.status).toBe('applied')
    if (res.status === 'applied') {
      expect(res.changed).toEqual(
        expect.arrayContaining(['options.txt', 'iris.properties', 'voxy-config.json'])
      )
    }

    const opts = fs.readFileSync(path.join(mcPath, 'options.txt'), 'utf8')
    expect(opts).toContain('particles:1')
    expect(opts).toContain('entityDistanceScaling:0.75')
    expect(opts).toContain('betterBiomeBlendRadius:8')
    expect(opts).toContain('renderDistance:12')
    // les touches et autres clés restent intactes
    expect(opts).toContain('key_key.forward:key.keyboard.w')
    expect(opts).toContain('lang:fr_fr')
    // pas de doublon de clé
    expect(opts.match(/^particles:/gm)).toHaveLength(1)

    const iris = fs.readFileSync(path.join(mcPath, 'config', 'iris.properties'), 'utf8')
    expect(iris).toContain('maxShadowRenderDistance=12')
    // on ne touche PAS au shader choisi ni à enableShaders
    expect(iris).toContain('enableShaders=true')
    expect(iris).toContain('shaderPack=CompleUnbound.zip')

    const voxy = JSON.parse(
      fs.readFileSync(path.join(mcPath, 'config', 'voxy-config.json'), 'utf8')
    )
    expect(voxy.enabled).toBe(true)
    expect(voxy.section_render_distance).toBe(3.9375)
    expect(voxy.service_threads).toBe(10) // conservé

    expect(fs.existsSync(path.join(mcPath, MARKER))).toBe(true)
  })

  it('ajoute une clé absente dans options.txt', () => {
    fs.writeFileSync(path.join(mcPath, 'options.txt'), 'version:3955\nlang:fr_fr\n')
    migrateGraphics(mcPath)
    const opts = fs.readFileSync(path.join(mcPath, 'options.txt'), 'utf8')
    expect(opts).toContain('particles:1')
    expect(opts).toContain('entityDistanceScaling:0.75')
  })

  it('ne refait rien si le marqueur existe déjà (idempotent)', () => {
    fs.writeFileSync(path.join(mcPath, 'options.txt'), SAMPLE_OPTIONS)
    fs.writeFileSync(path.join(mcPath, MARKER), 'done')

    const res = migrateGraphics(mcPath)

    expect(res.status).toBe('skipped')
    expect(fs.readFileSync(path.join(mcPath, 'options.txt'), 'utf8')).toBe(SAMPLE_OPTIONS)
  })

  it('pose juste le marqueur pour un nouveau joueur (pas de options.txt)', () => {
    const res = migrateGraphics(mcPath)
    expect(res.status).toBe('fresh')
    expect(fs.existsSync(path.join(mcPath, MARKER))).toBe(true)
  })

  it('préserve les fins de ligne CRLF de options.txt', () => {
    fs.writeFileSync(path.join(mcPath, 'options.txt'), 'particles:0\r\nlang:fr_fr\r\n')
    migrateGraphics(mcPath)
    const opts = fs.readFileSync(path.join(mcPath, 'options.txt'), 'utf8')
    expect(opts).toContain('particles:1\r\n')
    expect(opts).toContain('lang:fr_fr\r\n')
  })
})
