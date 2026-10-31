---
description: "Desktop Profile 的可移植 Agent Preset 包：导出声明式组合，并以一条 profile row 导入。"
---

# @deepseek-ai/dsh-preset-transfer

[English](README.md) | 中文

## 摘要

在已鉴权的回环连接上以 `.dshpreset` 文件交换自定义 Agent Preset。包内只携带 Preset 声明的子组合，导入不会复制会话、凭据、模型设置或工作区文件。

Desktop Profile 会挂载本包；其他 Profile 不暴露这些路由。

## 目录

- [包格式](#package-format)
- [路由](#routes)
- [安全边界](#security-bounds)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="package-format"></a>
## 包格式

`.dshpreset` 是一个 ZIP 归档：

```text
manifest.json
preset/plugins.yml
preset/preset.yml      # optional display record
```

`manifest.json` 使用格式版本 2：

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

`preset/plugins.yml` 是 Preset 的子入口列表，使用 Loader 自己的 YAML 方言（包含 `!!js` 条件）。导入时会把它包装成一条声明式 row：

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
## 路由

所有路由都要求 Desktop 鉴权 Cookie，可从应用的 loopback 源以 `$DSH_WEB_URL` 访问。

| 路由 | 方法 | 用途 |
|---|---|---|
| `/api/agent-preset.list` | GET | 带展示信息和 `isDefault` 的 Preset 列表。 |
| `/api/agent-preset.export?agentPreset=<id>` | GET | 导出一个 Preset；省略 id 时导出当前默认值。响应类型为 `application/vnd.dsh.preset+zip`。 |
| `/api/agent-preset.import` | POST | 校验并预览包；请求体为 ZIP 字节。 |
| `/api/agent-preset.import?install=1` | POST | 把声明式 row 追加到当前 profile patch，并要求重启。 |

安装不会覆盖已有 Preset 或 row id；冲突返回 `409`。安装成功时原子写入 profile patch，保留已有注释和 row。

<a id="security-bounds"></a>
## 安全边界

- 压缩后最多 16 MiB；每个接受的文件最多 2 MiB。
- 只读取 `manifest.json`、`preset/plugins.yml` 和 `preset/preset.yml`；其他归档项会被忽略且不会解压落盘。
- Preset id 必须是短的、路径安全的标识符。
- 追加后目标文件必须仍是顶层 YAML 序列。

## 模型体验

### 传输路由

#### 模型看到什么

没有直接影响：本包不注册工具、提示词或 schema；调用方通过 `\/api\/agent-preset.export` 和 `\/api\/agent-preset.import` 访问。导出的包携带未来 Agent 可能挂载的子组合。

#### Token 影响

无。这些路由不修改运行中会话的上下文。

#### KV Cache 影响

无。导入的 Preset 在重启后影响新 Agent。

## 已知限制与后续工作

- Desktop 壳通过应用菜单提供导出与导入入口；没有设置页选择器，且调用时 Desktop Host 必须已就绪。
- 导入的 Preset 在重启后出现；本包不会热挂载 profile row。
- 模型提供方设置、API Key、会话和工作区文件被有意排除在归档之外。
