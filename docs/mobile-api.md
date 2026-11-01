# Panorama Harness 手机连接 API（mobile/v1）

面向 iOS、Android、HarmonyOS 原生 App。手机只访问桌面移动桥，不直接访问 Host 端口或 Host cookie。

## 传输

- LAN：`http://<desktop-ip>:<port>`，WebSocket `ws://.../mobile/v1/ws`；
- 隧道：Cloudflare / Pinggy 的 HTTPS/WSS；
- 认证：除配对接口外，统一 `Authorization: Bearer <sessionToken>`；
- 内容：JSON UTF-8；流式使用 WebSocket，SSE 仅用于 Web 兜底。

## 配对

桌面配对页展示二维码：

```text
http(s)://<host>:<port>/pair?token=<43字符>&v=1
```

App 解析出 `token` 后：

```http
POST /mobile/v1/pair/claim
Content-Type: application/json

{ "token": "<pairingToken>" }
```

LAN 成功：

```json
{
  "ok": true,
  "mode": "lan",
  "sessionToken": "<43字符>",
  "desktop": { "name": "Panorama Harness", "profile": "desktop" },
  "capabilities": { "apiVersion": 1, "tunnels": ["cloudflare","pinggy"], "questions": true }
}
```

隧道成功但需要 PIN：

```json
{ "ok": true, "mode": "tunnel", "pinRequired": true, "challenge": "<随机>" }
```

```http
POST /mobile/v1/pair/verify
{ "challenge": "<challenge>", "pin": "123456" }
```

成功后返回 `sessionToken`。错误：`INVALID_TOKEN`、`INVALID_PIN`、`PIN_EXPIRED`、`RATE_LIMITED`。

## 认证与状态

- 保存 `sessionToken` 到系统安全存储：iOS Keychain、Android Keystore/EncryptedSharedPreferences、HarmonyOS Asset Store Kit；
- 请求头 `Authorization: Bearer`；
- 401 表示需要重新配对或重新输入 PIN。

```http
GET /mobile/v1/status
GET /mobile/v1/capabilities
```

状态包含 `connected`、`mode`、`tunnelProvider`、`tunnelExpiresAt`、`apiVersion`、`desktop`。

## RPC

```http
POST /mobile/v1/rpc
{ "method": "session.list", "payload": {} }
```

响应 `{ ok: true, value }` 或 `{ ok: false, error: { code, message } }`。

允许的方法：

- `session.list`
- `session.history`：`{ sessionId, maxMessages }`
- `session.create`：`{ workspaceId }`
- `session.prompt`：`{ sessionId, content: [{type:'text',text}], clientTimeZone, mode }`
- `session.cancel`：`{ sessionId }`
- `session.models`、`session.selectModel`
- `agentPreset.list`、`agentPreset.select`
- `workspace.list`
- `interaction.pending`、`interaction.answer`、`interaction.cancel`

## 会话流

1. `POST /mobile/v1/session/ticket` `{ sessionId }` → 30 秒一次性 `ticket`；
2. `GET /mobile/v1/ws?sessionId=<id>&ticket=<ticket>` 升级 WebSocket。

帧：

```json
{ "type": "snapshot", "value": { "records": [], "projections": {} } }
{ "type": "event", "value": { "event": {} } }
{ "type": "ping" }
{ "type": "error", "code": "SESSION_NOT_FOUND" }
```

关闭码：`4001` 凭证失效，`4004` 会话不存在，`4029` 限流。断线后 App 调用 `session.history` 重新取快照。

## 重连/断开

```http
POST /mobile/v1/reconnect
POST /mobile/v1/disconnect
```

- `reconnect` 成功恢复桌面“断开手机”挂起的会话；否则 401 `RESCAN_REQUIRED`；
- 隧道模式可能返回 PIN 重新验证；
- 桌面重启、切换 profile、退出后旧 `sessionToken` 全部失效。

## 平台注意

- iOS：ATS 允许本地网络、`NSLocalNetworkUsageDescription`；URLSession + URLSessionWebSocketTask；Keychain；
- Android：仅对私有地址开放 cleartext；OkHttp + WebSocket；EncryptedSharedPreferences；
- HarmonyOS：网络配置允许局域网明文、`ohos.permission.INTERNET`；`@ohos.net.http` + `@ohos.net.webSocket`；Asset Store Kit；
- 三端扫码分别使用 AVFoundation、CameraX/ML Kit、Scan Kit；
- 后台挂起后回前台重连，并调用 `session.history` 补历史。
