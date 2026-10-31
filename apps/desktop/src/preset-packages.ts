/** Native export and import of `.dshpreset` packages over the running Host's authenticated connection. */

import { readFile, writeFile } from 'node:fs/promises'
import { dialog } from 'electron'
import { formatDesktopMessage, type DesktopLocale } from './locale.ts'

/** Host connection facts captured per operation so a restart cannot mix generations. */
export interface PresetPackageHost {
  readonly url: string
  readonly cookie: string
}

/** Shell-owned inputs for the preset package actions. */
export interface DesktopPresetPackagesOptions {
  readonly locale: () => DesktopLocale
  /** Current Host connection, or `undefined` before the Host is ready. */
  readonly host: () => PresetPackageHost | undefined
  /** Main window used as the native dialog owner when available. */
  readonly owner: () => Electron.BrowserWindow | undefined
}

interface ImportPreview {
  readonly ok: true
  readonly preset: { readonly id: string; readonly name?: string; readonly plugins: number }
  readonly rowId: string
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') return body.error
  return fallback
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 500) }
  }
}

/** Two native file actions available from the application menu. */
export class DesktopPresetPackages {
  /** @param options - Locale, Host connection, and dialog owner. */
  constructor(private readonly options: DesktopPresetPackagesOptions) {}

  private connection(): PresetPackageHost | undefined { return this.options.host() }

  private messageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
    const owner = this.options.owner()
    return owner === undefined || owner.isDestroyed()
      ? dialog.showMessageBox(options)
      : dialog.showMessageBox(owner, options)
  }

  private async failure(detail: string): Promise<void> {
    const { messages } = this.options.locale()
    await this.messageBox({ type: 'error', title: messages.presetExportDialogTitle, message: messages.presetExportFailed, detail })
  }

  /** Export the current default preset to a user-chosen file. */
  async exportDefault(): Promise<void> {
    const { messages } = this.options.locale()
    const host = this.connection()
    if (host === undefined) {
      await this.failure('The Desktop Host is not ready.')
      return
    }
    const owner = this.options.owner()
    const save = owner === undefined || owner.isDestroyed()
      ? await dialog.showSaveDialog({ title: messages.presetExportDialogTitle,
        defaultPath: 'agent-preset.dshpreset', filters: [{ name: 'DSH Agent Preset', extensions: ['dshpreset'] }] })
      : await dialog.showSaveDialog(owner, { title: messages.presetExportDialogTitle,
        defaultPath: 'agent-preset.dshpreset', filters: [{ name: 'DSH Agent Preset', extensions: ['dshpreset'] }] })
    if (save.canceled || save.filePath === undefined) return
    try {
      const response = await fetch(new URL('/api/agent-preset.export', host.url), { headers: { cookie: host.cookie } })
      if (!response.ok) {
        await this.failure(errorMessage(await readJson(response), `HTTP ${String(response.status)}`))
        return
      }
      await writeFile(save.filePath, new Uint8Array(await response.arrayBuffer()))
      await this.messageBox({ type: 'info', title: messages.presetExportDialogTitle, message: messages.presetExported })
    } catch (error) {
      await this.failure(error instanceof Error ? error.message : String(error))
    }
  }

  /** Validate a chosen package, confirm, then append its profile row. */
  async importPackage(): Promise<void> {
    const { messages } = this.options.locale()
    const host = this.connection()
    if (host === undefined) {
      await this.failure('The Desktop Host is not ready.')
      return
    }
    const owner = this.options.owner()
    const open = owner === undefined || owner.isDestroyed()
      ? await dialog.showOpenDialog({ title: messages.presetImportDialogTitle, properties: ['openFile'],
        filters: [{ name: 'DSH Agent Preset', extensions: ['dshpreset'] }] })
      : await dialog.showOpenDialog(owner, { title: messages.presetImportDialogTitle, properties: ['openFile'],
        filters: [{ name: 'DSH Agent Preset', extensions: ['dshpreset'] }] })
    if (open.canceled || open.filePaths[0] === undefined) return
    try {
      const bytes = await readFile(open.filePaths[0])
      const previewResponse = await fetch(new URL('/api/agent-preset.import', host.url), {
        method: 'POST', headers: { cookie: host.cookie }, body: new Uint8Array(bytes).buffer,
      })
      const preview = await readJson(previewResponse) as Partial<ImportPreview> & { error?: string }
      if (!previewResponse.ok || preview.ok !== true || preview.preset === undefined || preview.rowId === undefined) {
        await this.importFailure(errorMessage(preview, `HTTP ${String(previewResponse.status)}`))
        return
      }
      const name = preview.preset.name ?? preview.preset.id
      const confirm = await this.messageBox({
        type: 'question', title: messages.presetImportDialogTitle,
        message: formatDesktopMessage(messages.presetImportConfirm, { name }),
        buttons: [messages.presetImportConfirmAction, messages.cancel], defaultId: 0, cancelId: 1,
      })
      if (confirm.response !== 0) return
      const installResponse = await fetch(new URL('/api/agent-preset.import?install=1', host.url), {
        method: 'POST', headers: { cookie: host.cookie }, body: new Uint8Array(bytes).buffer,
      })
      const installed = await readJson(installResponse)
      if (!installResponse.ok) {
        await this.importFailure(errorMessage(installed, `HTTP ${String(installResponse.status)}`))
        return
      }
      await this.messageBox({ type: 'info', title: messages.presetImportDialogTitle,
        message: formatDesktopMessage(messages.presetImported, { name }) })
    } catch (error) {
      await this.importFailure(error instanceof Error ? error.message : String(error))
    }
  }

  private async importFailure(detail: string): Promise<void> {
    const { messages } = this.options.locale()
    await this.messageBox({ type: 'error', title: messages.presetImportDialogTitle, message: messages.presetImportFailed, detail })
  }
}
