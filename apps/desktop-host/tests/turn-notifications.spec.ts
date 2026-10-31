import { describe, expect, it } from 'vitest'
import { SessionId, SessionSeq, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session/types'
import { turnNotificationFor } from '../src/turn-notifications.ts'

const header = { id: SessionId('session-1'), cwd: '/work/project' } satisfies Pick<SessionHeader, 'id' | 'cwd'>

function turnEnd(reason: Extract<SessionEvent, { type: 'turn/end' }>['data']['reason']): SessionEvent {
  return { type: 'turn/end', seq: SessionSeq(3), time: 1_000, data: { turn: 1, reason } }
}

describe('turn notifications', () => {
  it('reports a completed root turn with its project basename', () => {
    expect(turnNotificationFor(header, turnEnd({ kind: 'completed' }))).toEqual({
      sessionId: 'session-1',
      outcome: 'completed',
      project: 'project',
    })
  })

  it('reports errors and blocked turns as failures', () => {
    expect(turnNotificationFor(header, turnEnd({ kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } }))?.outcome)
      .toBe('failed')
    expect(turnNotificationFor(header, turnEnd({ kind: 'blocked' }))?.outcome).toBe('failed')
    expect(turnNotificationFor(header, turnEnd({ kind: 'max-tokens' }))?.outcome).toBe('completed')
  })

  it('skips cancellation, recovery markers, subagents, and unrelated events', () => {
    expect(turnNotificationFor(header, turnEnd({ kind: 'aborted', reason: { kind: 'user' } }))).toBeUndefined()
    expect(turnNotificationFor(header, turnEnd({ kind: 'interrupted' }))).toBeUndefined()
    expect(turnNotificationFor(header, turnEnd({ kind: 'forked' }))).toBeUndefined()
    expect(turnNotificationFor({ ...header, origin: 'subagent' }, turnEnd({ kind: 'completed' }))).toBeUndefined()
    expect(turnNotificationFor(header, {
      type: 'turn/start', seq: SessionSeq(2), time: 1_000, data: { turn: 1 },
    })).toBeUndefined()
  })

  it('omits the project when the session recorded no working directory', () => {
    const notification = turnNotificationFor({ id: SessionId('session-2') }, turnEnd({ kind: 'completed' }))
    expect(notification).toEqual({ sessionId: 'session-2', outcome: 'completed' })
  })
})
