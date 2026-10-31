import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopTurnNotifications } from '../src/turn-notifications.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const shown: FakeNotification[] = []
  class FakeNotification extends EventEmitter {
    readonly show = vi.fn()
    constructor(readonly options: { title: string; body: string }) {
      super()
      shown.push(this)
    }
  }
  return { shown, FakeNotification }
})

vi.mock('electron', () => ({ Notification: native.FakeNotification }))

afterEach(() => { native.shown.length = 0; vi.clearAllMocks() })

function setup(options: { enabled?: boolean; notify?: boolean } = {}) {
  const focus = vi.fn()
  const notifier = new DesktopTurnNotifications({
    locale: () => resolveDesktopLocale('en'),
    enabled: () => options.enabled ?? true,
    shouldNotify: () => options.notify ?? true,
    focus,
  })
  return { notifier, focus }
}

const completed = { sessionId: 'session-1', outcome: 'completed' as const, project: 'project' }

describe('desktop turn notifications', () => {
  it('shows the localized completion copy with the project and focuses the window on click', () => {
    const { notifier, focus } = setup()
    notifier.notify(completed)
    expect(native.shown).toHaveLength(1)
    expect(native.shown[0]!.options).toEqual({ title: 'DeepSeek Harness', body: 'Task completed · project' })
    expect(native.shown[0]!.show).toHaveBeenCalledOnce()
    native.shown[0]!.emit('click')
    expect(focus).toHaveBeenCalledOnce()
  })

  it('uses failure copy and omits a missing project', () => {
    const { notifier } = setup()
    notifier.notify({ sessionId: 'session-2', outcome: 'failed' })
    expect(native.shown[0]!.options.body).toBe('Task failed')
  })

  it('drops notifications when the preference is off or the window is in view', () => {
    setup({ enabled: false }).notifier.notify(completed)
    setup({ notify: false }).notifier.notify(completed)
    expect(native.shown).toHaveLength(0)
  })
})
