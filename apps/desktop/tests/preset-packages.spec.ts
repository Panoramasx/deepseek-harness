import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopPresetPackages } from '../src/preset-packages.ts'

const native = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: native.showSaveDialog,
    showOpenDialog: native.showOpenDialog,
    showMessageBox: native.showMessageBox,
  },
}))
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  readFile: native.readFile,
  writeFile: native.writeFile,
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  native.showMessageBox.mockResolvedValue({ response: 0 })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function actions(host: { url: string; cookie: string } | undefined = { url: 'http://127.0.0.1:4319/', cookie: 'dsh=a' }) {
  return new DesktopPresetPackages({
    locale: () => resolveDesktopLocale('en'),
    host: () => host,
    owner: () => undefined,
  })
}

describe('preset package menu actions', () => {
  it('writes the exported archive chosen by the save dialog', async () => {
    native.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/reviewer.dshpreset' })
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    await actions().exportDefault()
    expect(fetchMock).toHaveBeenCalledWith(new URL('http://127.0.0.1:4319/api/agent-preset.export'), {
      headers: { cookie: 'dsh=a' },
    })
    expect(native.writeFile).toHaveBeenCalledWith('/tmp/reviewer.dshpreset', new Uint8Array([1, 2, 3]))
    expect(native.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: 'Agent preset exported.' }))
  })

  it('previews, confirms, then installs a chosen package', async () => {
    native.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/reviewer.dshpreset'] })
    native.readFile.mockResolvedValue(Buffer.from([1, 2, 3]))
    fetchMock
      .mockResolvedValueOnce(Response.json({ ok: true, rowId: 'preset-package-reviewer',
        preset: { id: 'reviewer', name: 'Reviewer', plugins: 2 } }))
      .mockResolvedValueOnce(Response.json({ ok: true, installed: true, restartRequired: true }))
    await actions().importPackage()
    expect(native.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Import agent preset "Reviewer"? It becomes available after a restart.',
    }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/api/agent-preset.import?install=1')
    expect(native.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Agent preset "Reviewer" was added. Restart the application to use it.',
    }))
  })

  it('reports an unavailable Host without opening a dialog', async () => {
    const unavailable = new DesktopPresetPackages({
      locale: () => resolveDesktopLocale('en'), host: () => undefined, owner: () => undefined,
    })
    await unavailable.exportDefault()
    expect(native.showSaveDialog).not.toHaveBeenCalled()
    expect(native.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
  })
})
