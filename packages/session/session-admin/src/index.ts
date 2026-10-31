/**
 * Session administration over authenticated API routes: permanent deletion
 * and moving a stored Session to another Workspace.
 *
 * Deletion removes the stored log, its projection cache, and the Workspace
 * account/pin/archive entries. Moving recreates the log under the target
 * project directory through the official persistence writer, refreshes the
 * Workspace header index, and transfers the account. Both operations require a
 * closed Session, re-check activity fail-closed, and locate stored directories
 * by scanning the persistence root rather than reproducing its path encoding.
 *
 * @module @deepseek-ai/dsh-session-admin
 */

import { lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { SessionId as brandSessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { Workspace, WorkspaceId as WorkspaceIdBrand, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

/** Stable Cordis plugin name. */
export const name = 'session-admin'

/** Authenticated connection and persistence provider required by both operations. */
export const inject = ['connection', 'sessionPersistence']

const DELETE_PATH = '/api/session-admin/delete'
const TARGETS_PATH = '/api/session-admin/targets'
const MOVE_PATH = '/api/session-admin/move'
const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const MAX_BODY_BYTES = 64 * 1024
const MAX_LOG_BYTES = 128 * 1024 * 1024
const APPEND_CHUNK = 500

const MESSAGES = {
  badBody: '请求格式无效。',
  badId: '会话 ID 无效。',
  badTarget: '目标工作区无效。',
  active: '该会话正在使用中，请先关闭它。',
  busy: '该会话仍有进行中的工作或正在移动，请稍后再试。',
  ambiguous: '找到多个同名会话目录，已中止操作。',
  missing: '没有找到该会话的本地记录。',
  noCwd: '该会话没有原始工作目录，无法移动。',
  seeded: '分叉或子智能体会话暂不支持移动。',
  format: '该会话仍是旧格式，暂不支持移动。',
  tooLarge: '会话记录过大，暂不支持移动。',
  sameWorkspace: '目标工作区与当前工作区相同。',
  targetNotFound: '目标工作区不存在。',
  targetMissing: '目标工作区目录不存在或不可用。',
  oldDir: '无法定位该会话的本地目录，已中止操作。',
  incomplete: '会话记录不完整，已中止移动。',
  failed: '操作失败，请稍后重试。',
  attach: '会话日志已移动，但工作区分组失败；请刷新页面或重启应用。',
  restore: '操作失败且无法自动恢复，请保留临时目录并联系支持。',
}

/** One rejected administration request with its HTTP status and stable code. */
class SessionAdminError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

const moving = new Set<string>()

function json(status: number, payload: unknown): Response {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

function failure(status: number, code: string, error: string): Response {
  return json(status, { ok: false, code, error })
}

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text()
  if (raw.length === 0) return undefined
  if (raw.length > MAX_BODY_BYTES) throw new SessionAdminError(413, 'bad-body', MESSAGES.badBody)
  try {
    return JSON.parse(raw)
  } catch {
    throw new SessionAdminError(400, 'bad-body', MESSAGES.badBody)
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSessionId(body: unknown): SessionId {
  const id = record(body) && typeof body.sessionId === 'string' ? body.sessionId : undefined
  if (id === undefined || !SESSION_ID.test(id)) throw new SessionAdminError(400, 'bad-id', MESSAGES.badId)
  return brandSessionId(id)
}

function parseWorkspaceId(body: unknown): WorkspaceIdBrand {
  const id = record(body) && typeof body.workspaceId === 'string' ? body.workspaceId : undefined
  if (id === undefined || id.length === 0) throw new SessionAdminError(400, 'bad-target', MESSAGES.badTarget)
  return WorkspaceId(id)
}

/** Sessions directory, canonicalized when it exists. */
async function sessionsRoot(): Promise<string> {
  const root = resolve(resolveDshHome(), 'sessions')
  return realpath(root).catch(() => root)
}

/**
 * Locate every real stored directory for one session id under the sessions root.
 * Symbolic links are skipped so neither operation can follow a crafted link
 * outside the persistence root.
 */
async function locateSessionDirs(root: string, sessionId: SessionId): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const found: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(root, entry.name, sessionId)
    if (!candidate.startsWith(root + sep)) continue
    try {
      const info = await lstat(candidate)
      if (info.isDirectory() && !info.isSymbolicLink()) found.push(candidate)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return found
}

/**
 * Ask composed activity providers whether the Session still has work. An
 * unavailable provider counts as work in progress because both operations are
 * destructive or relocate a writable log.
 */
async function hasActivity(ctx: Context, sessionId: SessionId): Promise<boolean> {
  try {
    const activity = await ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]))
    return !Array.isArray(activity) || activity.length > 0
  } catch {
    return true
  }
}

function workspaceList(ctx: Context): { registry: WorkspaceRegistry | undefined; workspaces: Workspace[] } {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return { registry: undefined, workspaces: [] }
  return { registry, workspaces: registry.list() }
}

async function forget(ctx: Context, registry: WorkspaceRegistry | undefined,
  workspaces: readonly Workspace[], sessionId: SessionId): Promise<void> {
  if (registry === undefined) return
  for (const workspace of workspaces) {
    if (!workspace.sessionIds.includes(sessionId)) continue
    try {
      await workspace.detachSession(sessionId)
    } catch (error) {
      ctx.logger?.warn?.(`session-admin: detach from workspace '${workspace.id}' failed: ${String(error)}`)
    }
  }
  for (const method of ['unarchiveSession', 'unpinSession'] as const) {
    try {
      await registry[method](sessionId)
    } catch (error) {
      ctx.logger?.warn?.(`session-admin: ${method} failed: ${String(error)}`)
    }
  }
}

async function deleteSession(ctx: Context, sessionId: SessionId): Promise<Response> {
  const live = ctx.get('sessions')?.get(sessionId)
  if (live !== undefined) return failure(409, 'active', MESSAGES.active)
  if (await hasActivity(ctx, sessionId)) return failure(409, 'busy', MESSAGES.busy)

  const { registry, workspaces } = workspaceList(ctx)
  const root = await sessionsRoot()
  const dirs = await locateSessionDirs(root, sessionId)
  if (dirs.length > 1) return failure(409, 'ambiguous', MESSAGES.ambiguous)
  for (const directory of dirs) await rm(directory, { recursive: true, force: false, maxRetries: 3 })
  await rm(join(resolveDshHome(), 'storages', 'session_projcache', 'sessions', `${sessionId}.json`), { force: true })
  await forget(ctx, registry, workspaces, sessionId)
  return json(200, { ok: true, removed: dirs.length })
}

function movableReason(ctx: Context, sessionId: SessionId, snapshot: {
  readonly header: { readonly cwd?: string; readonly isSeeded: boolean; readonly parentSession?: unknown; readonly origin?: string }
  readonly formatStatus?: 'current' | 'migration-required'
  readonly sizeBytes?: number
}): string | undefined {
  if (ctx.get('sessions')?.get(sessionId) !== undefined) return 'active'
  if (snapshot.header.cwd === undefined) return 'no-cwd'
  if (snapshot.header.isSeeded || snapshot.header.parentSession !== undefined || snapshot.header.origin === 'subagent') return 'seeded'
  if (snapshot.formatStatus !== undefined && snapshot.formatStatus !== 'current') return 'format'
  if (typeof snapshot.sizeBytes === 'number' && snapshot.sizeBytes > MAX_LOG_BYTES) return 'too-large'
  return undefined
}

async function listTargets(ctx: Context, sessionId: SessionId): Promise<Response> {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return failure(503, 'failed', MESSAGES.failed)
  const snapshot = await ctx.sessionPersistence.stat(sessionId)
  if (snapshot === undefined) return failure(404, 'missing', MESSAGES.missing)

  const headerPath = snapshot.header.cwd === undefined
    ? undefined
    : await realpath(snapshot.header.cwd).catch(() => snapshot.header.cwd)
  const workspaces = []
  for (const workspace of registry.list()) {
    let status: 'ok' | 'missing-dir'
    try {
      status = await workspace.status()
    } catch {
      status = 'missing-dir'
    }
    workspaces.push({
      id: workspace.id,
      title: workspace.title,
      path: workspace.path,
      status,
      current: headerPath !== undefined && headerPath === workspace.path,
    })
  }
  let reason = movableReason(ctx, sessionId, snapshot)
  if (reason === undefined && await hasActivity(ctx, sessionId)) reason = 'busy'
  return json(200, {
    ok: true,
    sessionId,
    workspaces,
    currentWorkspaceId: workspaces.find(workspace => workspace.current)?.id ?? null,
    movable: reason === undefined,
    ...(reason === undefined ? {} : { reason }),
  })
}

async function readAllEvents(ctx: Context, sessionId: SessionId): Promise<readonly SessionEvent[]> {
  const handle = await ctx.sessionPersistence.open(sessionId, 'read')
  try {
    return (await handle.read(0)).events
  } finally {
    await handle.close()
  }
}

async function writeMovedLog(ctx: Context, snapshot: {
  readonly header: Parameters<Context['sessionPersistence']['create']>[0]
}, cwd: string, events: readonly SessionEvent[]): Promise<void> {
  const handle = await ctx.sessionPersistence.create(
    { ...snapshot.header, cwd },
    { inheritedEventCount: SessionLogOffset(0) },
  )
  try {
    for (let index = 0; index < events.length; index += APPEND_CHUNK) {
      await handle.append(events.slice(index, index + APPEND_CHUNK))
    }
    await handle.flush()
  } finally {
    await handle.close()
  }
}

async function reindex(ctx: Context, sessionId: SessionId): Promise<void> {
  await ctx.get('workspaceRegistry')?.reindexSession(sessionId)
}

async function restoreOldLog(ctx: Context, oldDir: string, parked: string, sessionId: SessionId): Promise<void> {
  const root = await sessionsRoot()
  for (const directory of await locateSessionDirs(root, sessionId)) {
    await rm(directory, { recursive: true, force: true })
  }
  await mkdir(dirname(oldDir), { recursive: true })
  await rename(parked, oldDir)
  await reindex(ctx, sessionId)
}

async function moveSession(ctx: Context, sessionId: SessionId, workspaceId: WorkspaceIdBrand): Promise<Response> {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return failure(503, 'failed', MESSAGES.failed)
  const target = registry.get(workspaceId)
  if (target === undefined) return failure(404, 'target-not-found', MESSAGES.targetNotFound)
  if (await target.status() !== 'ok') return failure(409, 'target-missing', MESSAGES.targetMissing)

  const snapshot = await ctx.sessionPersistence.stat(sessionId)
  if (snapshot === undefined) return failure(404, 'missing', MESSAGES.missing)
  const reason = movableReason(ctx, sessionId, snapshot)
  if (reason === 'active') return failure(409, 'active', MESSAGES.active)
  if (reason === 'no-cwd') return failure(409, 'no-cwd', MESSAGES.noCwd)
  if (reason === 'seeded') return failure(409, 'seeded', MESSAGES.seeded)
  if (reason === 'format') return failure(409, 'format', MESSAGES.format)
  if (reason === 'too-large') return failure(413, 'too-large', MESSAGES.tooLarge)
  if (await hasActivity(ctx, sessionId)) return failure(409, 'busy', MESSAGES.busy)

  const header = snapshot.header
  if (header.cwd === undefined) return failure(409, 'no-cwd', MESSAGES.noCwd)
  const headerPath = await realpath(header.cwd).catch(() => header.cwd)
  if (headerPath === target.path) return failure(409, 'same-workspace', MESSAGES.sameWorkspace)

  const root = await sessionsRoot()
  const dirs = await locateSessionDirs(root, sessionId)
  if (dirs.length !== 1) return failure(409, 'old-dir', MESSAGES.oldDir)
  const [oldDir] = dirs
  if (oldDir === undefined) return failure(409, 'old-dir', MESSAGES.oldDir)

  let events: readonly SessionEvent[]
  try {
    events = await readAllEvents(ctx, sessionId)
  } catch {
    return failure(409, 'missing', MESSAGES.missing)
  }
  if (typeof snapshot.eventCount === 'number' && events.length !== snapshot.eventCount) {
    return failure(409, 'incomplete', MESSAGES.incomplete)
  }

  const home = resolveDshHome()
  const tempRoot = await mkdtemp(join(home, '.session-move-'))
  const parked = join(tempRoot, 'session')
  await rename(oldDir, parked)

  try {
    await writeMovedLog(ctx, snapshot, target.path, events)
    const after = await ctx.sessionPersistence.stat(sessionId)
    if (after === undefined || after.header.cwd !== target.path
      || (typeof snapshot.eventCount === 'number' && typeof after.eventCount === 'number'
        && after.eventCount !== snapshot.eventCount)) {
      throw new Error('moved session did not verify')
    }
    await reindex(ctx, sessionId)
  } catch (error) {
    try {
      await restoreOldLog(ctx, oldDir, parked, sessionId)
    } catch (restoreError) {
      return failure(500, 'restore-failed', `${MESSAGES.restore}（${tempRoot}）: ${String(restoreError)}`)
    }
    ctx.logger?.warn?.(`session-admin: move failed before attach: ${String(error)}`)
    return failure(500, 'failed', MESSAGES.failed)
  }

  try {
    await target.attachSession(sessionId)
  } catch (error) {
    ctx.logger?.warn?.(`session-admin: attach to '${target.id}' failed: ${String(error)}`)
    try {
      await restoreOldLog(ctx, oldDir, parked, sessionId)
    } catch (restoreError) {
      return failure(500, 'restore-failed', `${MESSAGES.restore}（${tempRoot}）: ${String(restoreError)}`)
    }
    return failure(500, 'attach-failed', MESSAGES.attach)
  }

  for (const workspace of registry.list()) {
    if (workspace.id === target.id) continue
    try {
      await workspace.detachSession(sessionId)
    } catch (error) {
      ctx.logger?.warn?.(`session-admin: detach from '${workspace.id}' failed: ${String(error)}`)
    }
  }

  await rm(parked, { recursive: true, force: true }).catch((error: unknown) => {
    ctx.logger?.warn?.(`session-admin: parked log cleanup failed: ${String(error)}`)
  })
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  await rm(join(home, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`), { force: true })
  return json(200, { ok: true, workspace: { id: target.id, title: target.title, path: target.path } })
}

async function handle(ctx: Context, path: string, request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await readJson(request)
  } catch (error) {
    if (error instanceof SessionAdminError) return failure(error.status, error.code, error.message)
    throw error
  }
  try {
    const sessionId = parseSessionId(body)
    if (path === DELETE_PATH) return await deleteSession(ctx, sessionId)
    if (path === TARGETS_PATH) return await listTargets(ctx, sessionId)
    const workspaceId = parseWorkspaceId(body)
    if (moving.has(sessionId)) return failure(409, 'busy', MESSAGES.busy)
    moving.add(sessionId)
    try {
      return await moveSession(ctx, sessionId, workspaceId)
    } finally {
      moving.delete(sessionId)
    }
  } catch (error) {
    if (error instanceof SessionAdminError) return failure(error.status, error.code, error.message)
    throw error
  }
}

/**
 * Register the authenticated Session administration routes.
 * @param ctx - Host context carrying the connection and persistence services.
 */
export function apply(ctx: Context): void {
  const register = (path: string, label: string): void => {
    ctx.effect(() => ctx.connection.fetch.register({
      path,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => handle(ctx, path, request).catch((error: unknown) => {
        ctx.logger?.warn?.(`session-admin: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
        return failure(500, 'failed', MESSAGES.failed)
      }),
    }), label)
  }
  register(DELETE_PATH, 'session-admin: delete')
  register(TARGETS_PATH, 'session-admin: targets')
  register(MOVE_PATH, 'session-admin: move')
}
