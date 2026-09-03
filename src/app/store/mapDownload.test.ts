import { describe, it, expect } from 'vitest'
import type { MapDownloadProgress } from '../../electron/types/mapDownload'
import {
  applyMapProgress,
  computeSpeedBytesPerSec,
  formatBytes,
  formatEta,
  MAP_LABELS,
  pushSample,
} from './mapDownload'
import type { MapDownloadState } from './mapDownload'

const IDLE: MapDownloadState = {
  active: false,
  arcId: null,
  status: 'idle',
  percent: 0,
  label: '',
  sublabel: null,
  error: null,
}

const GO = 1024 ** 3

describe('formatBytes', () => {
  it('formats gigabytes with one decimal and a comma', () => {
    expect(formatBytes(GO)).toBe('1,0 Go')
    expect(formatBytes(12.4 * GO)).toBe('12,4 Go')
  })

  it('formats below 1 Go in megabytes', () => {
    expect(formatBytes(500 * 1024 ** 2)).toBe('500 Mo')
  })
})

describe('formatEta', () => {
  it('formats seconds below a minute', () => {
    expect(formatEta(0)).toBe('0 s')
    expect(formatEta(45)).toBe('45 s')
  })

  it('formats minutes below an hour', () => {
    expect(formatEta(60)).toBe('1 min')
    expect(formatEta(427)).toBe('7 min')
  })

  it('formats hours with padded minutes', () => {
    expect(formatEta(3600)).toBe('1 h')
    expect(formatEta(4320)).toBe('1 h 12')
    expect(formatEta(9000)).toBe('2 h 30')
  })

  it('caps absurd durations', () => {
    expect(formatEta(99.5 * 3600)).toBe('99+ h')
  })

  it('returns a dash for invalid values', () => {
    expect(formatEta(Number.POSITIVE_INFINITY)).toBe('—')
    expect(formatEta(-5)).toBe('—')
  })
})

describe('pushSample / computeSpeedBytesPerSec', () => {
  it('returns null with fewer than two samples', () => {
    expect(computeSpeedBytesPerSec([])).toBeNull()
    expect(computeSpeedBytesPerSec([{ at: 1000, bytes: 10 }])).toBeNull()
  })

  it('returns null when the window is too short', () => {
    expect(
      computeSpeedBytesPerSec([
        { at: 1000, bytes: 10 },
        { at: 1200, bytes: 20 },
      ])
    ).toBeNull()
  })

  it('returns null when bytes did not progress (restart/stall)', () => {
    expect(
      computeSpeedBytesPerSec([
        { at: 1000, bytes: 100 },
        { at: 5000, bytes: 90 },
      ])
    ).toBeNull()
  })

  it('computes the rate over the window', () => {
    expect(
      computeSpeedBytesPerSec([
        { at: 0, bytes: 0 },
        { at: 2000, bytes: 10 * 1024 ** 2 },
        { at: 4000, bytes: 20 * 1024 ** 2 },
      ])
    ).toBe(5 * 1024 ** 2)
  })

  it('prunes samples older than the window', () => {
    const base = [
      { at: 0, bytes: 0 },
      { at: 3000, bytes: 100 },
    ]

    const next = pushSample(base, 10_000, 500, 8000)

    expect(next).toHaveLength(2)
    expect(next[0]).toEqual({ at: 3000, bytes: 100 })
    expect(next[1]).toEqual({ at: 10_000, bytes: 500 })
  })
})

describe('applyMapProgress', () => {
  it('activates the download on checking', () => {
    const next = applyMapProgress(IDLE, { arcId: 'arcend-01', status: 'checking', percent: 0 })

    expect(next).toEqual({
      active: true,
      arcId: 'arcend-01',
      status: 'checking',
      percent: 0,
      label: MAP_LABELS.checking,
      sublabel: null,
      error: null,
    })
  })

  it('builds the Go sublabel while downloading', () => {
    const progress: MapDownloadProgress = {
      arcId: 'arcend-01',
      status: 'downloading',
      percent: 37,
      processedBytes: 12.4 * GO,
      totalBytes: 30.2 * GO,
    }

    const next = applyMapProgress(IDLE, progress)

    expect(next.active).toBe(true)
    expect(next.sublabel).toBe('12,4 / 30,2 Go')
  })

  it('appends speed and ETA to the sublabel when a rate is provided', () => {
    const next = applyMapProgress(
      IDLE,
      {
        arcId: 'arcend-01',
        status: 'downloading',
        percent: 41,
        processedBytes: 12.4 * GO,
        totalBytes: 30.2 * GO,
      },
      { bytesPerSec: 42.7 * 1024 ** 2 }
    )

    // (30,2 - 12,4) Go / 42,7 Mo/s ≈ 427 s ≈ 7 min
    expect(next.sublabel).toBe('12,4 / 30,2 Go · 42,7 Mo/s · 7 min')
  })

  it('omits the ETA when the total size is unknown', () => {
    const next = applyMapProgress(
      IDLE,
      {
        arcId: 'arcend-01',
        status: 'downloading',
        percent: 0,
        processedBytes: 5 * GO,
      },
      { bytesPerSec: 10 * 1024 ** 2 }
    )

    expect(next.sublabel).toBe('5,0 Go · 10,0 Mo/s')
  })

  it('omits the ETA when the download is complete bytes-wise', () => {
    const next = applyMapProgress(
      IDLE,
      {
        arcId: 'arcend-01',
        status: 'downloading',
        percent: 90,
        processedBytes: 30.2 * GO,
        totalBytes: 30.2 * GO,
      },
      { bytesPerSec: 42.7 * 1024 ** 2 }
    )

    expect(next.sublabel).toBe('30,2 / 30,2 Go · 42,7 Mo/s')
  })

  it('ignores a null or zero rate', () => {
    const progress: MapDownloadProgress = {
      arcId: 'arcend-01',
      status: 'downloading',
      percent: 37,
      processedBytes: 12.4 * GO,
      totalBytes: 30.2 * GO,
    }

    expect(applyMapProgress(IDLE, progress, null).sublabel).toBe('12,4 / 30,2 Go')
    expect(applyMapProgress(IDLE, progress, { bytesPerSec: null }).sublabel).toBe('12,4 / 30,2 Go')
    expect(applyMapProgress(IDLE, progress, { bytesPerSec: 0 }).sublabel).toBe('12,4 / 30,2 Go')
  })

  it('shows only the downloaded size when the total is unknown', () => {
    const next = applyMapProgress(IDLE, {
      arcId: 'arcend-01',
      status: 'downloading',
      percent: 0,
      processedBytes: 5 * GO,
    })

    expect(next.sublabel).toBe('5,0 Go')
  })

  it('keeps no sublabel while extracting without byte info', () => {
    const next = applyMapProgress(IDLE, {
      arcId: 'arcend-01',
      status: 'extracting',
      percent: 95,
    })

    expect(next.sublabel).toBeNull()
    expect(next.percent).toBe(95)
  })

  it('builds the same sublabel (ratio, speed, ETA) while extracting', () => {
    const next = applyMapProgress(
      IDLE,
      {
        arcId: 'arcend-01',
        status: 'extracting',
        percent: 93,
        processedBytes: 12.4 * GO,
        totalBytes: 50.3 * GO,
      },
      { bytesPerSec: 85.4 * 1024 ** 2 }
    )

    // (50,3 - 12,4) Go / 85,4 Mo/s ≈ 454 s ≈ 8 min
    expect(next.sublabel).toBe('12,4 / 50,3 Go · 85,4 Mo/s · 8 min')
    expect(next.label).toBe(MAP_LABELS.extracting)
  })

  it('completes on done', () => {
    const next = applyMapProgress(IDLE, { arcId: 'arcend-01', status: 'done', percent: 100 })

    expect(next.active).toBe(false)
    expect(next.percent).toBe(100)
    expect(next.label).toBe(MAP_LABELS.done)
  })

  it('deactivates on cancelled without error', () => {
    const next = applyMapProgress(IDLE, { arcId: 'arcend-01', status: 'cancelled', percent: 0 })

    expect(next.active).toBe(false)
    expect(next.error).toBeNull()
    expect(next.label).toBe(MAP_LABELS.cancelled)
  })

  it('surfaces the error message', () => {
    const next = applyMapProgress(IDLE, {
      arcId: 'arcend-01',
      status: 'error',
      percent: 0,
      error: 'Espace disque insuffisant',
    })

    expect(next.active).toBe(false)
    expect(next.error).toBe('Espace disque insuffisant')
    expect(next.label).toBe(MAP_LABELS.error)
  })

  it('labels the error by failing phase', () => {
    const extractError = applyMapProgress(IDLE, {
      arcId: 'arcend-01',
      status: 'error',
      percent: 0,
      error: 'File size (37319111261) is greater than 2 GiB',
      errorPhase: 'extract',
    })

    expect(extractError.label).toBe("Échec de l'extraction")

    const downloadError = applyMapProgress(IDLE, {
      arcId: 'arcend-01',
      status: 'error',
      percent: 0,
      error: 'HTTP 403',
      errorPhase: 'download',
    })

    expect(downloadError.label).toBe('Échec du téléchargement')
  })

  it('clamps the percent into [0, 100]', () => {
    const next = applyMapProgress(IDLE, {
      arcId: 'arcend-01',
      status: 'downloading',
      percent: 150,
    })

    expect(next.percent).toBe(100)
  })
})
