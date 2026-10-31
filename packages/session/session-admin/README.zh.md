---
description: "会话行菜单中的彻底删除与移至工作区，通过仅限 Desktop 的已鉴权 API 路由实现。"
---

# @deepseek-ai/dsh-session-admin

[English](README.md) | 中文

## 摘要

在会话行菜单中增加 **彻底删除会话…** 与 **移至工作区…** 两个操作。Host 半部通过已鉴权的 `/api/session-admin/*` 路由执行实际变更；浏览器半部只负责确认与选择目标。

Desktop Profile 挂载本包；其他 Profile 不暴露这些路由。

## 目录

- [使用](#use-this-package)
- [安全规则](#safety-rules)
- [路由](#routes)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用

打开会话行的 `⋯` 菜单：

- **移至工作区…** 列出已注册工作区及其路径、状态，预选第一个可用目标；通过目标项目目录重建事件日志来改写会话的原始 `cwd`，并同步工作区账目、头部索引与投影缓存。
- **彻底删除会话…** 确认后删除会话目录、投影缓存、工作区成员记录、置顶与归档记录。

两个操作成功后都会刷新页面；都不会删除可能被其他会话复用的附件。

<a id="safety-rules"></a>
## 安全规则

- 会话必须已关闭；打开中的会话会被拒绝。
- `workspace/session-activity` 必须报告没有进行中的工作。活动提供者不可用时按 busy 处理，即失败时拒绝而不是继续。
- 只考虑 `$DSH_HOME/sessions` 下两层的真实目录；符号链接一律跳过。
- 移动只支持当前格式、非分叉、非子代理的会话，日志上限 128 MiB；读取到的事件数与 `eventCount` 不一致时，在暂存旧目录之前中止。
- 移动会暂存旧日志，通过 `ctx.sessionPersistence` 写入新日志，再通过 `WorkspaceRegistry.reindexSession()` 刷新头部索引；写入或 attach 失败时恢复旧日志。
- 删除不可撤销；移动在 UI 上同样不可撤销，尽管失败时会回滚。

<a id="routes"></a>
## 路由

所有路由都要求 Desktop 鉴权 Cookie，并接受 JSON 请求体：

| 路由 | 用途 |
|---|---|
| `POST /api/session-admin/delete` | 永久删除一个会话。 |
| `POST /api/session-admin/targets` | 列出工作区及该会话是否可移动。 |
| `POST /api/session-admin/move` | 在另一个工作区重建日志并转移账目。 |

失败响应为 `{ ok: false, code, error }`；稳定 code 包括 `active`、`busy`、`ambiguous`、`missing`、`no-cwd`、`seeded`、`format`、`too-large`、`same-workspace`、`target-not-found`、`target-missing`、`old-dir`、`incomplete`、`attach-failed`、`restore-failed` 与 `failed`。

## 模型体验

### 会话行操作

#### 模型看到什么

没有直接影响：两个操作都是由人触发的菜单入口，走 `POST /api/session-admin/*`；它们不注册工具、提示词片段或 schema。

#### Token 影响

无。操作修改的是已存会话文件与工作区记录，不修改运行中 Agent 的上下文。

#### KV Cache 影响

无。移动后的会话保留相同事件与除 `cwd` 外的头部；下一次 Agent 请求仍按原历史组装。

## 已知限制与后续工作

- 移动要求会话原始 `cwd` 能解析到已注册工作区；没有头部 `cwd` 的导入会话无法移动。
- 浏览器半部提供全部八种界面语言（`zh`、`en`、`ja`、`es`、`fr`、`de`、`ru`、`pt`）。
- 因为行按 `profileContext.name === 'desktop'` 门控，菜单入口只存在于 Desktop Profile。
- 删除没有回收站或撤销；共享的 `$DSH_HOME/attachments` 按设计保留。
