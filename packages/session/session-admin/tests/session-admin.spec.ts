import { mkdir, mkdtemp, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

const ID = SessionId('session-11111111-2222-3333-4444-555555555555')
const OLD_CWD = '/tmp/ws-old'
const NEW_CWD = '/tmp/ws-new'

interface Route {
  path: string
  fetch: (request: Request) => Promise<Response>
}

interface FixtureOptions {
  activity?: unknown[]
  incomplete?: boolean
  live?: boolean
}

async function fixture(options: FixtureOptions = {}) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'dsh-session-admin-')))
  const oldDir = join(home, 'sessions', '--tmp-ws-old--', ID)
  const newDir = join(home, 'sessions', '--tmp-ws-new--', ID)
  await mkdir(oldDir, { recursive: true })
  await writeFile(join(oldDir, 'session.v4.jsonl.zstd'), 'old')
  await mkdir(join(home, 'storages', 'session_projcache', 'sessions'), { recursive: true })
  await writeFile(join(home, 'storages', 'session_projcache', 'sessions', `${ID}.json`), '{}')
  process.env.DSH_HOME = home

  const events = [
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
  ] as never[]
  const header = {
    version: 4 as const, id: ID, createdAt: 1, cwd: OLD_CWD, isSeeded: false,
  }
  let created: typeof header | undefined
  const persistence = {
    async stat(id: string) {
      expect(id).toBe(ID)
      if (created !== undefined) {
        return { header: created, formatStatus: 'current' as const, sizeBytes: 10, eventCount: events.length,
          revision: 'r' as never, location: { kind: 'jsonl' as const, path: join(newDir, 'session.v4.jsonl.zstd') } }
      }
      try {
        await stat(join(oldDir, 'session.v4.jsonl.zstd'))
      } catch {
        return undefined
      }
      return { header, formatStatus: 'current' as const, sizeBytes: 10,
        eventCount: events.length + (options.incomplete === true ? 1 : 0), revision: 'r' as never,
        location: { kind: 'jsonl' as const, path: join(oldDir, 'session.v4.jsonl.zstd') } }
    },
    async open() {
      return { async read() { return { events, eventState: 'owned' as const } }, async close() {} }
    },
    async create(next: typeof header) {
      created = next
      await mkdir(newDir, { recursive: true })
      await writeFile(join(newDir, 'session.v4.jsonl.zstd'), 'new')
      return { async append() {}, async flush() {}, async close() {} }
    },
  }

  const calls = {
    attach: [] as string[], detach: [] as string[], unarchive: [] as string[], unpin: [] as string[], reindex: [] as string[],
  }
  const workspaces = [
    { id: 'w-old', title: 'Old', path: OLD_CWD, sessionIds: [ID], async status() { return 'ok' as const },
      async detachSession(id: string) { calls.detach.push(id) }, async attachSession(id: string) { calls.attach.push(id) } },
    { id: 'w-new', title: 'New', path: NEW_CWD, sessionIds: [], async status() { return 'ok' as const },
      async detachSession(id: string) { calls.detach.push(id) }, async attachSession(id: string) { calls.attach.push(id) } },
  ]
  const registry = {
    list: () => workspaces,
    get: (id: string) => workspaces.find(workspace => workspace.id === id),
    async unarchiveSession(id: string) { calls.unarchive.push(id) },
    async unpinSession(id: string) { calls.unpin.push(id) },
    async reindexSession(id: string) { calls.reindex.push(id); return created ?? header },
  }

  const routes = new Map<string, Route>()
  const ctx = new Context()
  ctx.provide('connection', {
    fetch: {
      register(route: Route) {
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    },
  } as never)
  ctx.provide('sessionPersistence', persistence as never)
  ctx.provide('workspaceRegistry', registry as never)
  ctx.provide('sessions', { get: (id: string) => options.live === true && id === ID ? { header } : undefined } as never)
  const waterfall = vi.fn(async (_name: string, _payload: unknown, fallback: () => Promise<unknown>) =>
    options.activity === undefined ? fallback() : options.activity)
  ctx.waterfall = waterfall as never
  apply(ctx)

  async function call(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const route = routes.get(path)
    if (route === undefined) throw new Error(`missing route ${path}`)
    const response = await route.fetch(new Request(`http://127.0.0.1${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }))
    return { status: response.status, json: await response.json() as Record<string, unknown> }
  }

  return { home, oldDir, newDir, ctx, calls, call, routes }
}

afterEach(() => { delete process.env.DSH_HOME; vi.restoreAllMocks() })

describe('session administration routes', () => {
  it('deletes the stored log, projection cache, workspace account, pin, and archive entry', async () => {
    const f = await fixture()
    const result = await f.call('/api/session-admin/delete', { sessionId: ID })
    expect(result.status).toBe(200)
    expect(result.json).toEqual({ ok: true, removed: 1 })
    await expect(stat(join(f.oldDir, 'session.v4.jsonl.zstd'))).rejects.toThrow()
    await expect(stat(join(f.home, 'storages', 'session_projcache', 'sessions', `${ID}.json`))).rejects.toThrow()
    expect(f.calls.detach).toContain(ID)
    expect(f.calls.unpin).toContain(ID)
    expect(f.calls.unarchive).toContain(ID)
  })

  it('refuses a session with reported activity', async () => {
    const f = await fixture({ activity: [{ kind: 'turn' }] })
    const result = await f.call('/api/session-admin/delete', { sessionId: ID })
    expect(result.status).toBe(409)
    expect(result.json.code).toBe('busy')
    expect((await stat(join(f.oldDir, 'session.v4.jsonl.zstd'))).isFile()).toBe(true)
  })

  it('moves a closed session, reindexes the header, and transfers the workspace account', async () => {
    const f = await fixture()
    const result = await f.call('/api/session-admin/move', { sessionId: ID, workspaceId: 'w-new' })
    expect(result.status).toBe(200)
    await expect(stat(join(f.oldDir, 'session.v4.jsonl.zstd'))).rejects.toThrow()
    expect(await readFile(join(f.newDir, 'session.v4.jsonl.zstd'), 'utf8')).toBe('new')
    expect(f.calls.reindex).toContain(ID)
    expect(f.calls.attach).toContain(ID)
    expect(f.calls.detach).toContain(ID)
  })

  it('rejects a move into the current workspace', async () => {
    const f = await fixture()
    const result = await f.call('/api/session-admin/move', { sessionId: ID, workspaceId: 'w-old' })
    expect(result.status).toBe(409)
    expect(result.json.code).toBe('same-workspace')
    expect((await stat(join(f.oldDir, 'session.v4.jsonl.zstd'))).isFile()).toBe(true)
  })

  it('aborts an incomplete event log before parking the old directory', async () => {
    const f = await fixture({ incomplete: true })
    const result = await f.call('/api/session-admin/move', { sessionId: ID, workspaceId: 'w-new' })
    expect(result.status).toBe(409)
    expect(result.json.code).toBe('incomplete')
    expect((await stat(join(f.oldDir, 'session.v4.jsonl.zstd'))).isFile()).toBe(true)
  })
})
