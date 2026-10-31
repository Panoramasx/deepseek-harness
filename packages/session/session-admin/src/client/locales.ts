/** Browser copy for permanent Session deletion and Workspace moves. */

/** Locale namespace owned by the Session administration plugin. */
export const NS = 'session-admin'

export const en = {
  deleteMenu: 'Delete session permanently…',
  deleteTitle: 'Delete this session permanently?',
  deleteBody: 'All conversation records and local cache for “{name}” will be permanently removed. This cannot be undone.',
  deleteConfirm: 'Delete permanently',
  deleting: 'Deleting…',
  deleteFailed: 'Delete failed: {reason}',
  moveMenu: 'Move to workspace…',
  moveTitle: 'Move to workspace',
  moveDescription: 'Choose the destination workspace. Moving rewrites the session’s original working directory and relocates its local log. Close the session first; this cannot be undone.',
  moveConfirm: 'Move',
  moving: 'Moving…',
  moveFailed: 'Move failed: {reason}',
  loading: 'Loading workspaces…',
  empty: 'No other usable workspace. Add one from the sidebar first.',
  current: '(current)',
  missingDir: 'Directory missing',
  untitled: 'Untitled session',
  close: 'Close',
  cancel: 'Cancel',
  'error.active': 'This session is open. Close it before continuing.',
  'error.busy': 'This session still has work in progress. Stop it before continuing.',
  'error.ambiguous': 'Multiple stored directories matched this session id; nothing was changed.',
  'error.bad-id': 'Invalid session id.',
  'error.bad-body': 'Invalid request body.',
  'error.bad-target': 'Invalid destination workspace.',
  'error.missing': 'No stored record was found for this session.',
  'error.no-cwd': 'This session has no original working directory.',
  'error.seeded': 'Forked or subagent sessions cannot be moved yet.',
  'error.format': 'This session is still in an older format.',
  'error.too-large': 'The session log is too large to move.',
  'error.same-workspace': 'The destination is the current workspace.',
  'error.target-not-found': 'The destination workspace does not exist.',
  'error.target-missing': 'The destination workspace directory is missing or unusable.',
  'error.old-dir': 'The session’s local directory could not be located.',
  'error.incomplete': 'The stored session log is incomplete; nothing was moved.',
  'error.attach-failed': 'The log moved, but the workspace account could not be updated. Refresh or restart the app.',
  'error.restore-failed': 'The operation failed and could not be rolled back automatically. Keep the temporary directory and contact support.',
  'error.failed': 'The operation failed. Try again later.',
  'error.unknown': 'Unknown error',
} as const

/** Every browser key owned by this plugin. */
export type SessionAdminKey = keyof typeof en

export const zh: Record<SessionAdminKey, string> = {
  deleteMenu: '彻底删除会话…',
  deleteTitle: '彻底删除会话？',
  deleteBody: '“{name}”的全部对话记录与本地缓存将被永久删除，此操作无法撤销。',
  deleteConfirm: '彻底删除',
  deleting: '正在删除…',
  deleteFailed: '删除失败：{reason}',
  moveMenu: '移至工作区…',
  moveTitle: '移至工作区',
  moveDescription: '选择目标工作区。移动会改写该会话的原始工作目录并迁移本地日志；会话需先关闭，此操作不可撤销。',
  moveConfirm: '移动',
  moving: '正在移动…',
  moveFailed: '移动失败：{reason}',
  loading: '正在加载工作区…',
  empty: '没有其他可用的工作区。请先在侧栏添加工作区。',
  current: '（当前）',
  missingDir: '目录不存在',
  untitled: '未命名会话',
  close: '关闭',
  cancel: '取消',
  'error.active': '该会话正在使用中，请先关闭它。',
  'error.busy': '该会话仍有进行中的工作，请先停止后再试。',
  'error.ambiguous': '找到多个同名会话目录，未执行任何操作。',
  'error.bad-id': '会话 ID 无效。',
  'error.bad-body': '请求格式无效。',
  'error.bad-target': '目标工作区无效。',
  'error.missing': '没有找到该会话的本地记录。',
  'error.no-cwd': '该会话没有原始工作目录，无法移动。',
  'error.seeded': '分叉或子智能体会话暂不支持移动。',
  'error.format': '该会话仍是旧格式，暂不支持移动。',
  'error.too-large': '会话记录过大，暂不支持移动。',
  'error.same-workspace': '目标工作区与当前工作区相同。',
  'error.target-not-found': '目标工作区不存在。',
  'error.target-missing': '目标工作区目录不存在或不可用。',
  'error.old-dir': '无法定位该会话的本地目录。',
  'error.incomplete': '会话记录不完整，未执行移动。',
  'error.attach-failed': '会话日志已移动，但工作区分组失败；请刷新页面或重启应用。',
  'error.restore-failed': '操作失败且无法自动恢复，请保留临时目录并联系支持。',
  'error.failed': '操作失败，请稍后重试。',
  'error.unknown': '未知错误',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session administration menu and dialog copy. */
    'session-admin': SessionAdminKey
  }
}
