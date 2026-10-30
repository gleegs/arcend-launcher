import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

const mockShowSaveDialog = vi.fn()
const mockCopyFile = vi.fn()
const mockExistsSync = vi.fn()
const mockGetLogFilePath = vi.fn()

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/fake/downloads') },
  dialog: { showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args) },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    promises: { copyFile: (...args: unknown[]) => mockCopyFile(...args) },
  },
}))

vi.mock('../services/log', () => ({
  getLogFilePath: () => mockGetLogFilePath(),
}))

vi.mock('../services/window', () => ({
  getMainWindow: () => null,
}))

describe('registerLogsIpc', () => {
  beforeEach(async () => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockShowSaveDialog.mockReset()
    mockCopyFile.mockReset()
    mockExistsSync.mockReset().mockReturnValue(true)
    mockGetLogFilePath.mockReset().mockReturnValue('/fake/logs/launcher.log')
    vi.resetModules()
    const { registerLogsIpc } = await import('./logs.ipc')
    registerLogsIpc()
  })

  it('copies launcher.log to the chosen path', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/fake/out.txt' })

    const result = await handlers['logs:export']({})

    expect(mockCopyFile).toHaveBeenCalledWith('/fake/logs/launcher.log', '/fake/out.txt')
    expect(result).toEqual({ ok: true, data: '/fake/out.txt' })
  })

  it('returns null without copying when the dialog is canceled', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })

    const result = await handlers['logs:export']({})

    expect(mockCopyFile).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, data: null })
  })

  it('fails when there is no log file', async () => {
    mockExistsSync.mockReturnValue(false)

    const result = await handlers['logs:export']({})

    expect(result).toMatchObject({ ok: false })
    expect(mockShowSaveDialog).not.toHaveBeenCalled()
  })
})
