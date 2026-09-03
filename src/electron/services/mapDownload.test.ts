import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

vi.mock('../lib/paths', () => ({
  mapRegistryPath: '/fake/arcend/config/maps.json',
  arcsDir: '/fake/arcend/arcs',
}))

vi.mock('./window', () => ({
  getMainWindow: () => null,
}))

vi.mock('./arc', () => ({
  getArcPath: (arcId: string) => path.join('/fake/arcend/arcs', arcId),
  isInstalled: () => true,
}))

vi.mock('./supabase', () => ({
  fetchRemoteArc: vi.fn().mockResolvedValue(null),
}))

vi.mock('yauzl', () => ({
  default: {
    open: vi.fn(),
    openReadStream: vi.fn(),
    validateFileName: vi.fn(),
  },
}))

const { mockFsExistsSync, mockFsReaddirSync } = vi.hoisted(() => ({
  mockFsExistsSync: vi.fn(),
  mockFsReaddirSync: vi.fn(),
}))

vi.mock('node:fs', () => {
  const fns = {
    existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
    readdirSync: (...args: unknown[]) => mockFsReaddirSync(...args),
  }
  return { __esModule: true, default: fns, ...fns }
})

import {
  canResume,
  computeRequiredDiskSpaceBytes,
  deriveWorldNameFromUrl,
  detectWorldLayout,
  shouldSkipDownload,
  isTransientNetworkError,
} from './mapDownload'
import type { MapDownloadMeta } from '../types/mapDownload'

describe('computeRequiredDiskSpaceBytes', () => {
  it('sums zip and extracted sizes (peak before zip deletion)', () => {
    expect(computeRequiredDiskSpaceBytes(30 * 1024 ** 3, 50 * 1024 ** 3)).toBe(80 * 1024 ** 3)
  })

  it('estimates the extracted size as the zip size when unknown', () => {
    expect(computeRequiredDiskSpaceBytes(30 * 1024 ** 3, null)).toBe(60 * 1024 ** 3)
  })
})

describe('deriveWorldNameFromUrl', () => {
  it('decodes and strips the .zip extension from the OVH URL', () => {
    expect(
      deriveWorldNameFromUrl(
        'https://arcend-map-storage.s3.gra.io.cloud.ovh.net/Arcend%20-%20ARC%2001%20-%20Prologue.zip'
      )
    ).toBe('Arcend - ARC 01 - Prologue')
  })

  it('sanitizes characters forbidden in file names', () => {
    expect(deriveWorldNameFromUrl('https://example.com/a<b:c>d.zip')).toBe('a_b_c_d')
  })

  it('falls back to a generic name on invalid URL', () => {
    expect(deriveWorldNameFromUrl('not-a-url')).toBe('arcend-map')
  })
})

describe('isTransientNetworkError', () => {
  it('matches network failures', () => {
    expect(isTransientNetworkError('read ECONNRESET')).toBe(true)
    expect(isTransientNetworkError('socket hang up')).toBe(true)
    expect(isTransientNetworkError('timeout of 60000ms exceeded')).toBe(true)
  })

  it('does not match HTTP or integrity errors', () => {
    expect(isTransientNetworkError('Téléchargement échoué (HTTP 404).')).toBe(false)
    expect(isTransientNetworkError('Vérification SHA-256 échouée')).toBe(false)
  })
})

describe('canResume', () => {
  const meta = (overrides: Partial<MapDownloadMeta> = {}): MapDownloadMeta => ({
    etag: '"abc123"',
    totalBytes: 1000,
    downloadedBytes: 400,
    ...overrides,
  })

  it('resumes a valid partial download', () => {
    expect(canResume(meta(), true, '"abc123"', 1000)).toBe(true)
  })

  it('refuses without meta or part file', () => {
    expect(canResume(null, true, '"abc123"', 1000)).toBe(false)
    expect(canResume(meta(), false, '"abc123"', 1000)).toBe(false)
  })

  it('refuses when the remote object changed (etag mismatch)', () => {
    expect(canResume(meta(), true, '"other"', 1000)).toBe(false)
  })

  it('refuses when the etag is unknown (cannot guarantee the content)', () => {
    expect(canResume(meta(), true, null, 1000)).toBe(false)
    expect(canResume(meta({ etag: null }), true, '"abc123"', 1000)).toBe(false)
  })

  it('refuses when the total size changed', () => {
    expect(canResume(meta(), true, '"abc123"', 2000)).toBe(false)
  })

  it('refuses an empty or already-complete partial', () => {
    expect(canResume(meta({ downloadedBytes: 0 }), true, '"abc123"', 1000)).toBe(false)
    expect(canResume(meta({ downloadedBytes: 1000 }), true, '"abc123"', 1000)).toBe(false)
  })
})

describe('shouldSkipDownload', () => {
  it('skips when the complete zip is already on disk', () => {
    expect(shouldSkipDownload(37_319_111_261, 37_319_111_261)).toBe(true)
  })

  it('downloads again on size mismatch, partial file or unknown size', () => {
    expect(shouldSkipDownload(37_319_111_260, 37_319_111_261)).toBe(false)
    expect(shouldSkipDownload(null, 1000)).toBe(false)
    expect(shouldSkipDownload(1000, null)).toBe(false)
    expect(shouldSkipDownload(null, null)).toBe(false)
  })
})

describe('detectWorldLayout', () => {
  beforeEach(() => {
    mockFsExistsSync.mockReset()
    mockFsReaddirSync.mockReset()
  })

  it('detects level.dat at the zip root (needs wrapping)', () => {
    mockFsExistsSync.mockImplementation((p: string) => p === path.join('/tmp/x', 'level.dat'))

    const layout = detectWorldLayout('/tmp/x')

    expect(layout).toEqual({ worldDir: '/tmp/x', name: '' })
  })

  it('detects a single root folder containing level.dat', () => {
    mockFsExistsSync.mockImplementation(
      (p: string) => p === path.join('/tmp/x', 'world', 'level.dat')
    )
    mockFsReaddirSync.mockReturnValue([{ name: 'world', isDirectory: () => true }])

    const layout = detectWorldLayout('/tmp/x')

    expect(layout).toEqual({ worldDir: path.join('/tmp/x', 'world'), name: 'world' })
  })

  it('returns null when no world structure is recognized', () => {
    mockFsExistsSync.mockReturnValue(false)
    mockFsReaddirSync.mockReturnValue([
      { name: 'a', isDirectory: () => true },
      { name: 'b', isDirectory: () => true },
    ])

    expect(detectWorldLayout('/tmp/x')).toBeNull()
  })
})
