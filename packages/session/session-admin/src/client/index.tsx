/** Session row menu entries and dialogs for permanent deletion and Workspace moves. */

import type { Context } from '@deepseek-ai/cordis'
import {
  Button, IconFolderOpenOutlineRegular, IconTrashOutlineRegular, MenuItemButton, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { useSyncExternalStore, type ReactElement } from 'react'
import { en, NS, zh, type SessionAdminKey } from './locales.js'

const DELETE_PATH = '/api/session-admin/delete'
const TARGETS_PATH = '/api/session-admin/targets'
const MOVE_PATH = '/api/session-admin/move'

/** One target workspace offered by the move dialog. */
interface MoveWorkspace {
  readonly id: string
  readonly title: string
  readonly path: string
  readonly status: 'ok' | 'missing-dir'
  readonly current: boolean
}

type Dialog =
  | { readonly kind: 'delete'; readonly sessionId: string; readonly title: string; readonly busy: boolean; readonly failure: string }
  | {
    readonly kind: 'move'
    readonly sessionId: string
    readonly title: string
    readonly phase: 'loading' | 'ready' | 'error'
    readonly workspaces: readonly MoveWorkspace[]
    readonly selectedId: string | null
    readonly movable: boolean
    readonly reason: string
    readonly busy: boolean
    readonly failure: string
  }
  | null

const listeners = new Set<() => void>()
let dialog: Dialog = null

function publish(next: Dialog): void {
  dialog = next
  for (const notify of listeners) notify()
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  return () => { listeners.delete(notify) }
}

function snapshot(): Dialog { return dialog }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorKey(code: string): SessionAdminKey | undefined {
  const key = `error.${code}`
  return key in en ? key as SessionAdminKey : undefined
}

function failureText(t: (key: SessionAdminKey, values?: Record<string, string>) => string,
  payload: unknown, status: number): string {
  const code = record(payload) && typeof payload.code === 'string' ? payload.code : ''
  const key = code === '' ? undefined : errorKey(code)
  if (key !== undefined) return t(key)
  const reason = record(payload) && typeof payload.error === 'string' && payload.error !== ''
    ? payload.error
    : `HTTP ${String(status)}`
  return t('error.failed', { reason })
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  return { ok: response.ok, status: response.status, payload }
}

function currentDialog(): Dialog { return dialog }

function closeDialog(): void {
  if (dialog?.busy === true) return
  publish(null)
}

function openDelete(sessionId: string, title: string): void {
  publish({ kind: 'delete', sessionId, title, busy: false, failure: '' })
}

async function loadTargets(t: (key: SessionAdminKey) => string, sessionId: string): Promise<void> {
  try {
    const result = await post(TARGETS_PATH, { sessionId })
    const current = currentDialog()
    if (current === null || current.kind !== 'move' || current.sessionId !== sessionId) return
    if (!result.ok || !record(result.payload) || result.payload.ok !== true) {
      publish({ ...current, phase: 'error', failure: failureText(t, result.payload, result.status) })
      return
    }
    const raw = Array.isArray(result.payload.workspaces) ? result.payload.workspaces : []
    const workspaces: MoveWorkspace[] = raw.flatMap((item): MoveWorkspace[] => {
      if (!record(item) || typeof item.id !== 'string' || typeof item.title !== 'string'
        || typeof item.path !== 'string' || (item.status !== 'ok' && item.status !== 'missing-dir')) return []
      return [{ id: item.id, title: item.title, path: item.path, status: item.status, current: item.current === true }]
    })
    const first = workspaces.find(workspace => !workspace.current && workspace.status === 'ok')
    publish({
      ...current,
      phase: 'ready',
      workspaces,
      selectedId: first?.id ?? null,
      movable: result.payload.movable !== false,
      reason: typeof result.payload.reason === 'string' ? result.payload.reason : '',
    })
  } catch (error) {
    const current = currentDialog()
    if (current === null || current.kind !== 'move' || current.sessionId !== sessionId) return
    publish({ ...current, phase: 'error', failure: error instanceof Error ? error.message : String(error) })
  }
}

function openMove(t: (key: SessionAdminKey) => string, sessionId: string, title: string): void {
  publish({
    kind: 'move', sessionId, title, phase: 'loading', workspaces: [], selectedId: null,
    movable: true, reason: '', busy: false, failure: '',
  })
  void loadTargets(t, sessionId)
}

async function confirmDelete(t: (key: SessionAdminKey, values?: Record<string, string>) => string): Promise<void> {
  const current = currentDialog()
  if (current === null || current.kind !== 'delete' || current.busy) return
  publish({ ...current, busy: true, failure: '' })
  try {
    const result = await post(DELETE_PATH, { sessionId: current.sessionId })
    if (!result.ok) {
      publish({ ...current, busy: false, failure: failureText(t, result.payload, result.status) })
      return
    }
    window.location.reload()
  } catch (error) {
    publish({ ...current, busy: false, failure: error instanceof Error ? error.message : String(error) })
  }
}

async function confirmMove(t: (key: SessionAdminKey, values?: Record<string, string>) => string): Promise<void> {
  const current = currentDialog()
  if (current === null || current.kind !== 'move' || current.selectedId === null || current.busy || !current.movable) return
  publish({ ...current, busy: true, failure: '' })
  try {
    const result = await post(MOVE_PATH, { sessionId: current.sessionId, workspaceId: current.selectedId })
    if (!result.ok) {
      publish({ ...current, busy: false, failure: failureText(t, result.payload, result.status) })
      return
    }
    window.location.reload()
  } catch (error) {
    publish({ ...current, busy: false, failure: error instanceof Error ? error.message : String(error) })
  }
}

/** Delete action in the Session row menu. */
function DeleteMenuItem({ sessionId, displayTitle, useMenuOpenState, t }: PropsRuntime<'sidebar.workspaces.session.menu.item'> & PropsLocale<typeof NS>): ReactElement {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton danger separatorBefore icon={<IconTrashOutlineRegular />} onSelect={() => {
      setMenuOpen(false)
      openDelete(sessionId, displayTitle)
    }}>
      {t('deleteMenu')}
    </MenuItemButton>
  )
}

/** Move action in the Session row menu. */
function MoveMenuItem({ sessionId, displayTitle, useMenuOpenState, t }: PropsRuntime<'sidebar.workspaces.session.menu.item'> & PropsLocale<typeof NS>): ReactElement {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton icon={<IconFolderOpenOutlineRegular />} onSelect={() => {
      setMenuOpen(false)
      openMove(t, sessionId, displayTitle)
    }}>
      {t('moveMenu')}
    </MenuItemButton>
  )
}

function failureLine(text: string): ReactElement {
  return <div role="alert" style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px', lineHeight: '18px', wordBreak: 'break-word' }}>{text}</div>
}

function DeleteDialog({ view, t }: { readonly view: Extract<Dialog, { kind: 'delete' }>; readonly t: (key: SessionAdminKey, values?: Record<string, string>) => string }): ReactElement {
  const name = view.title.trim() === '' ? t('untitled') : view.title
  return (
    <Modal
      open
      onClose={closeDialog}
      closeLabel={t('close')}
      title={t('deleteTitle')}
      description={t('deleteBody', { name })}
      footer={(
        <>
          <Button variant="outline" disabled={view.busy} onClick={closeDialog} data-modal-autofocus>{t('cancel')}</Button>
          <Button variant="outline" disabled={view.busy} onClick={() => { void confirmDelete(t) }}
            style={{ color: 'var(--dsw-alias-state-error-primary)' }}>
            {view.busy ? t('deleting') : t('deleteConfirm')}
          </Button>
        </>
      )}
    >
      {view.failure === '' ? null : failureLine(view.failure)}
    </Modal>
  )
}

function MoveDialog({ view, t }: { readonly view: Extract<Dialog, { kind: 'move' }>; readonly t: (key: SessionAdminKey, values?: Record<string, string>) => string }): ReactElement {
  const hasTarget = view.workspaces.some(workspace => !workspace.current && workspace.status === 'ok')
  const canConfirm = view.phase === 'ready' && view.movable && view.selectedId !== null && !view.busy && hasTarget
  return (
    <Modal
      open
      onClose={closeDialog}
      closeLabel={t('close')}
      title={t('moveTitle')}
      description={t('moveDescription')}
      footer={(
        <>
          <Button variant="outline" disabled={view.busy} onClick={closeDialog} data-modal-autofocus>{t('cancel')}</Button>
          <Button variant="primary" disabled={!canConfirm} onClick={() => { void confirmMove(t) }}>
            {view.busy ? t('moving') : t('moveConfirm')}
          </Button>
        </>
      )}
    >
      {view.phase === 'loading' ? <div style={{ fontSize: '12px', lineHeight: '18px' }}>{t('loading')}</div> : null}
      {view.failure === '' ? null : failureLine(view.failure)}
      {view.phase === 'ready' && !view.movable && view.reason !== ''
        ? <div role="status" style={{ fontSize: '12px', lineHeight: '18px' }}>{failureText(t, { code: view.reason }, 409)}</div>
        : null}
      {view.phase === 'ready' && view.movable && !hasTarget
        ? <div style={{ fontSize: '12px', lineHeight: '18px' }}>{t('empty')}</div>
        : null}
      {view.phase === 'ready' && view.movable && hasTarget
        ? (
          <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
            {view.workspaces.map((workspace) => {
              const selected = view.selectedId === workspace.id
              const disabled = workspace.current || workspace.status !== 'ok' || view.busy
              return (
                <button
                  key={workspace.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    const current = currentDialog()
                    if (current?.kind === 'move') publish({ ...current, selectedId: workspace.id })
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', width: '100%',
                    padding: '8px 10px', borderRadius: '8px', textAlign: 'left', font: 'inherit', color: 'inherit',
                    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
                    border: selected ? '1px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-l)',
                    background: selected ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: '13px', lineHeight: '20px', fontWeight: 500 }}>
                    {workspace.current ? `${workspace.title}${t('current')}` : workspace.title}
                  </span>
                  <span style={{ fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', wordBreak: 'break-all' }}>{workspace.path}</span>
                  {workspace.status !== 'ok' ? <span style={{ fontSize: '12px', lineHeight: '18px' }}>{t('missingDir')}</span> : null}
                </button>
              )
            })}
          </div>
        )
        : null}
    </Modal>
  )
}

/** Overlay rendering whichever administration dialog is open. */
function AdminDialog({ t }: PropsLocale<typeof NS>): ReactElement | null {
  const view = useSyncExternalStore(subscribe, snapshot)
  if (view === null) return null
  return view.kind === 'delete' ? <DeleteDialog view={view} t={t} /> : <MoveDialog view={view} t={t} />
}

/** Services required by the browser half. */
export const inject = ['slots', 'locale']

/**
 * Register the menu entries, dictionaries, and shared overlay.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-admin: dictionaries')
  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item', id: 'session-admin-move', order: 500, locale: NS,
  }, MoveMenuItem))
  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item', id: 'session-admin-delete', order: 900, locale: NS,
  }, DeleteMenuItem))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'session-admin-dialog', locale: NS,
  }, AdminDialog))
}
