import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { RemoteArc } from '../types/arc'

const { mockApp, mockReadFileSync } = vi.hoisted(() => ({
  mockApp: { isPackaged: false },
  mockReadFileSync: vi.fn(),
}))

vi.mock('electron', () => ({ app: mockApp }))

vi.mock('node:fs', () => {
  const fns = { readFileSync: (...args: unknown[]) => mockReadFileSync(...args) }
  return { __esModule: true, default: fns, ...fns }
})

import { loadDevArcs, withDevArcs } from './devArcs'

const devArcFile = '/dev/arcs-dev.json'

function supabaseArc(slug: string): RemoteArc {
  return { ...loadDevArcsFrom([{ slug }])[0], name: `Supabase ${slug}` }
}

function loadDevArcsFrom(content: unknown): RemoteArc[] {
  mockReadFileSync.mockReturnValue(JSON.stringify(content))
  return loadDevArcs()
}

describe('devArcs', () => {
  beforeEach(() => {
    mockApp.isPackaged = false
    mockReadFileSync.mockReset()
    process.env.ARCEND_DEV_ARCS_FILE = devArcFile
  })

  afterEach(() => {
    delete process.env.ARCEND_DEV_ARCS_FILE
  })

  it('ignores the file when the variable is not set', () => {
    delete process.env.ARCEND_DEV_ARCS_FILE

    expect(loadDevArcs()).toEqual([])
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('ignores the file in a packaged build (players)', () => {
    mockApp.isPackaged = true

    expect(loadDevArcs()).toEqual([])
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('loads the arcs of the file and fills the missing fields with null', () => {
    const arcs = loadDevArcsFrom([
      { slug: 'arcend-arc02', mcVersion: '1.20.1', loader: 'forge', serverPort: 25570 },
    ])

    expect(mockReadFileSync).toHaveBeenCalledWith(devArcFile, 'utf-8')
    expect(arcs).toHaveLength(1)
    expect(arcs[0]).toMatchObject({
      slug: 'arcend-arc02',
      mcVersion: '1.20.1',
      loader: 'forge',
      serverPort: 25570,
      serverHost: null,
      modpackUrl: null,
      coverUrl: null,
    })
  })

  it('skips the entries without slug', () => {
    expect(loadDevArcsFrom([{ name: 'sans slug' }, { slug: 'ok' }]).map((a) => a.slug)).toEqual([
      'ok',
    ])
  })

  it('returns no arc for an invalid file', () => {
    mockReadFileSync.mockReturnValue('{ pas du json')
    expect(loadDevArcs()).toEqual([])

    expect(loadDevArcsFrom({ slug: 'pas-un-tableau' })).toEqual([])
  })

  it('adds the dev arcs first and lets them replace a Supabase arc of the same slug', () => {
    const supabaseArcs = [supabaseArc('arcend-prologue'), supabaseArc('arcend-arc02')]
    mockReadFileSync.mockReturnValue(JSON.stringify([{ slug: 'arcend-arc02', name: 'Dev' }]))

    const arcs = withDevArcs(supabaseArcs)

    expect(arcs.map((a) => [a.slug, a.name])).toEqual([
      ['arcend-arc02', 'Dev'],
      ['arcend-prologue', 'Supabase arcend-prologue'],
    ])
  })

  it('returns the Supabase arcs unchanged without dev arcs', () => {
    delete process.env.ARCEND_DEV_ARCS_FILE
    const supabaseArcs: RemoteArc[] = []

    expect(withDevArcs(supabaseArcs)).toBe(supabaseArcs)
  })
})
