---
description: "Permanent Session deletion and Workspace moves from the Session row menu, over authenticated Desktop-only API routes."
---

# @deepseek-ai/dsh-session-admin

English | [中文](README.zh.md)

## Summary

Adds two Session row menu actions: **Delete session permanently…** and **Move to workspace…**. The Host half owns both operations over authenticated `/api/session-admin/*` routes; the browser half only collects confirmation and the destination.

The Desktop profile mounts this package; other profiles leave the routes absent.

## Table of Contents

- [Use this package](#use-this-package)
- [Safety rules](#safety-rules)
- [Routes](#routes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Open a Session row’s `⋯` menu:

- **Move to workspace…** lists registered Workspaces with their paths and status, preselects the first usable destination, and rewrites the Session’s original `cwd` by recreating its event log under the target project directory. The Workspace account, header index, and projection cache follow.
- **Delete session permanently…** asks for confirmation, then removes the stored log directory, projection cache, Workspace account membership, pin, and archive entry.

Both actions reload the page after success. Neither action touches attachments shared by other Sessions.

<a id="safety-rules"></a>
## Safety rules

- The Session must be closed; an open Session is refused.
- `workspace/session-activity` must report no work. An unavailable provider counts as busy, so a failed check refuses rather than proceeds.
- Only real stored directories two levels below `$DSH_HOME/sessions` are considered; symbolic links are skipped.
- Move supports current-format, non-seeded, non-subagent Sessions only, caps the log at 128 MiB, and aborts before parking the old directory when `eventCount` disagrees with the read events.
- A move parks the old log, writes the new one through `ctx.sessionPersistence`, refreshes the Workspace header index through `WorkspaceRegistry.reindexSession()`, and restores the parked log if writing or attaching fails.
- Deletion is irreversible. Move is irreversible from the UI even though a late failure rolls back.

<a id="routes"></a>
## Routes

All routes require the Desktop authentication cookie and accept JSON bodies:

| Route | Purpose |
|---|---|
| `POST /api/session-admin/delete` | Permanently remove one Session. |
| `POST /api/session-admin/targets` | List Workspaces and whether the Session is movable. |
| `POST /api/session-admin/move` | Recreate the log under another Workspace and transfer its account. |

Failure responses use `{ ok: false, code, error }`; stable codes are `active`, `busy`, `ambiguous`, `missing`, `no-cwd`, `seeded`, `format`, `too-large`, `same-workspace`, `target-not-found`, `target-missing`, `old-dir`, `incomplete`, `attach-failed`, `restore-failed`, and `failed`.

## Model Experience

### Session row actions

#### What the model sees

Nothing directly: both actions are human-triggered menu entries over `POST /api/session-admin/*`. They never register a tool, prompt section, or schema.

#### Token effect

None. The actions mutate stored Session files and Workspace records, not a running Agent’s context.

#### KV Cache effect

None. A moved Session keeps the same events and header apart from `cwd`; the next Agent request assembles from that stored history exactly as before.

## Known Limitations and Deferred Work

- Moves still require the Session’s original `cwd` to resolve to a registered Workspace; Sessions imported without a header `cwd` cannot move.
- The browser half ships all eight shell languages (`zh`, `en`, `ja`, `es`, `fr`, `de`, `ru`, `pt`).
- The menu entries exist only in the Desktop profile because the rows are gated on `profileContext.name === 'desktop'`.
- Deletion has no trash or undo. Attachments shared through `$DSH_HOME/attachments` are retained by design.
