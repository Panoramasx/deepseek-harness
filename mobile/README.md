# Mobile clients

Desktop side is `apps/desktop/src/mobile/`; the contract is `docs/mobile-api.md` and `mobile/contracts/openapi.json`.

Planned native SDKs:

- `sdk-swift` — Swift Package: URLSession, URLSessionWebSocketTask, Keychain;
- `sdk-kotlin` — Kotlin/Android library: OkHttp, WebSocket, EncryptedSharedPreferences;
- `sdk-arkts` — HarmonyOS HAR: `@ohos.net.http`, `@ohos.net.webSocket`, Asset Store Kit.

`contract-tests` will run the pairing/RPC/WS flows against a local bridge.
