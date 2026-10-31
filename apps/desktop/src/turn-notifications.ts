/** Native notification for a finished turn, delivered only while the shell is out of the way. */

import { Notification } from 'electron'
import type { DesktopTurnNotification } from './host-process.ts'
import type { DesktopLocale } from './locale.ts'

/** Inputs owned by the shell: locale, the persisted switch, window state, and focus. */
export interface DesktopTurnNotificationsOptions {
  readonly locale: () => DesktopLocale
  /** Persisted notification preference, read once per process. */
  readonly enabled: () => boolean
  /** True when the main window is hidden, unfocused, or absent, and no welcome window is showing. */
  readonly shouldNotify: () => boolean
  /** Raise and focus the product window. */
  readonly focus: () => void
}

/** Show at most one native notification per finished turn. */
export class DesktopTurnNotifications {
  /** @param options - Locale, preference, window-state, and focus callbacks. */
  constructor(private readonly options: DesktopTurnNotificationsOptions) {}

  /**
   * Present one finished turn, or drop it when the preference is off or the shell is in view.
   * @param payload - Finished turn reported by the Host.
   */
  notify(payload: DesktopTurnNotification): void {
    if (!this.options.enabled() || !this.options.shouldNotify()) return
    const { messages } = this.options.locale()
    const message = payload.outcome === 'failed' ? messages.turnFailed : messages.turnCompleted
    const notification = new Notification({
      title: messages.aboutProduct,
      body: payload.project === undefined ? message : `${message} · ${payload.project}`,
    })
    notification.on('click', () => { this.options.focus() })
    notification.show()
  }
}
