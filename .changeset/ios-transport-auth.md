---
'@conciv/extension-ios': patch
---

Harden the iOS transport and auth path (M5). `ios.run` now points the launched app at
the core's own native page URL (carrying the `/t/<token>` prefix when the core is
token-scoped) instead of a bare `CONCIV_URL` env, with an optional `concivUrl` config
override. A dev core that serves the native page writes a `~/.conciv/dev-endpoint.json`
pairing file (`0600`, never logged) on startup and removes it on shutdown, so the Swift
SDK can discover the core deterministically on the simulator, validate it over
`/health`, and fall back to probing a candidate port list. The SDK self-heals same-core
port drift via a handshake rebind (pid-matched) and surfaces a re-pair prompt on a stale
token (`401`/`404` on the token-scoped base).
