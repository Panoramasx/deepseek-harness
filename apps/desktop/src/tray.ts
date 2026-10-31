/** Tray icon: the always-present way back to a hidden window and the explicit quit entry. */

import { Menu, nativeImage, Tray } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
  /** Windows multi-size ICO, or the 18 px macOS template PNG; macOS discovers the sibling `@2x` bitmap. */
  readonly iconPath: string
  /** macOS renders the whale as a template image so the menu bar supplies its own tint. */
  readonly template: boolean
  /** Windows opens the window on a single click; macOS shows the context menu on click instead. */
  readonly platform: 'darwin' | 'win32'
  readonly locale: () => DesktopLocale
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Request quit through the same confirmation as every other quit entry. */
  readonly quit: () => void
}

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined

  /** @param options - Icon, platform behavior, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const image = nativeImage.createFromPath(options.iconPath)
    if (options.template) image.setTemplateImage(true)
    const tray = new Tray(image)
    this.tray = tray
    if (options.platform === 'win32') tray.on('click', () => { options.open() })
    this.relabel()
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => { this.options.open() } },
      { type: 'separator' },
      { label: messages.quitApplication, click: () => { this.options.quit() } },
    ]))
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}
