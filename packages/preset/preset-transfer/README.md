---
description: "Portable Agent preset packages for the Desktop profile: export a declared composition and import it as one profile row."
---

# @deepseek-ai/dsh-preset-transfer

English | [中文](README.zh.md)

## Summary

Exchanges custom Agent presets as `.dshpreset` files over the authenticated loopback connection. A package carries the preset's declared child composition, so importing it does not copy sessions, credentials, model settings, or workspace files.

The Desktop profile mounts this package; other profiles do not expose the routes.

## Table of Contents

- [Package format](#package-format)
- [Routes](#routes)
- [Security bounds](#security-bounds)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="package-format"></a>
## Package format

A `.dshpreset` file is a ZIP archive:

```text
manifest.json
preset/plugins.yml
preset/preset.yml      # optional display record
```

`manifest.json` uses format version 2:

```json
{
  "format": "dsh-preset",
  "version": 2,
  "id": "reviewer",
  "name": "Reviewer",
  "description": "Reviews changes",
  "sourceDshVersion": "0.2.2-alpha.2",
  "exportedAt": "2026-10-31T00:00:00.000Z"
}
```

`preset/plugins.yml` is the preset's child entry list in the Loader's YAML dialect (`!!js` conditions included). Import wraps it in one declarative row:

```yaml
- insert:
    - id: preset-package-reviewer
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: reviewer
        name: Reviewer
        plugins: [...]
```

<a id="routes"></a>
## Routes

All routes require the Desktop authentication cookie; they are reachable from the application's loopback origin as `$DSH_WEB_URL`.

| Route | Method | Purpose |
|---|---|---|
| `/api/agent-preset.list` | GET | Preset roster with display metadata and `isDefault`. |
| `/api/agent-preset.export?agentPreset=<id>` | GET | Export one preset; an omitted id exports the current default. Responds with `application/vnd.dsh.preset+zip`. |
| `/api/agent-preset.import` | POST | Validate and preview a package; the body is the ZIP bytes. |
| `/api/agent-preset.import?install=1` | POST | Append the declarative row to the active profile patch and require a restart. |

Installing never overwrites an existing preset or row id; a conflict returns `409`. A successful install writes the profile patch atomically and leaves existing comments and rows untouched.

<a id="security-bounds"></a>
## Security bounds

- At most 16 MiB compressed; each accepted file at most 2 MiB.
- Only `manifest.json`, `preset/plugins.yml`, and `preset/preset.yml` are read; other archive entries are ignored and never extracted.
- Preset ids must be short path-safe identifiers.
- The target must stay a top-level YAML sequence after appending.

## Model Experience

### Transfer routes

#### What the model sees

Nothing directly: the package registers no tool, prompt, or schema; callers reach `\/api\/agent-preset.export` and `\/api\/agent-preset.import`. An exported package carries the child composition that future Agents may mount.

#### Token effect

None. The routes do not modify a running Session's context.

#### KV Cache effect

None. Imported presets shape new Agents after a restart.

## Known Limitations and Deferred Work

- The Desktop shell exposes export and import as application-menu actions; there is no settings-page picker, and the caller must already have a running Desktop Host.
- Imported presets appear after a restart; the package does not hot-mount a profile row.
- Model provider settings, API keys, sessions, and workspace files are deliberately excluded from the archive.
