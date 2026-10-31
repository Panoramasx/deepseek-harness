/** Publish one shell notification when a user-started turn finishes. */

import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session/types'

/** One finished turn the shell may surface as a native notification. */
export interface DesktopTurnNotification {
  /** Session that finished; the shell does not yet navigate to it. */
  readonly sessionId: string
  /** `failed` covers errors and blocked turns; other terminal reasons count as completed. */
  readonly outcome: 'completed' | 'failed'
  /** Working-directory basename, when the session recorded one. */
  readonly project?: string
}

/**
 * Classify one session event for notification.
 * @param header - Session creation metadata.
 * @param event - Session event to inspect.
 * @returns the notification to publish, or `undefined` when the event is not a notifiable turn end.
 */
export function turnNotificationFor(
  header: Pick<SessionHeader, 'id' | 'cwd' | 'origin'>,
  event: SessionEvent,
): DesktopTurnNotification | undefined {
  if (event.type !== 'turn/end') return undefined
  if (header.origin === 'subagent') return undefined
  const { reason } = event.data
  if (reason.kind === 'aborted' || reason.kind === 'interrupted' || reason.kind === 'forked') return undefined
  const outcome = reason.kind === 'error' || reason.kind === 'blocked' ? 'failed' : 'completed'
  const cwd = header.cwd
  return {
    sessionId: String(header.id),
    outcome,
    ...(cwd === undefined || cwd === '' ? {} : { project: basename(cwd) }),
  }
}

/**
 * Report finished root sessions over the Desktop host IPC channel.
 * @param ctx - Host context carrying session events.
 * @param publish - Sends one notification message to the Electron shell.
 */
export function installDesktopTurnNotifications(ctx: Context, publish: (notification: DesktopTurnNotification) => void): void {
  ctx.on('session/event', (session, event) => {
    const notification = turnNotificationFor(session.header, event)
    if (notification !== undefined) publish(notification)
  }, { global: true })
}
