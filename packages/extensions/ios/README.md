# @conciv/extension-ios

Internal built-in extension for driving a native iOS (simulator) app from the conciv
agent. It ships the WKWebView page and native bridge protocol, the `ios.*` server
tools (`build`, `run`, `screenshot`, `logs`), and the transport plumbing that points
the in-app WebView at the dev core. Installed automatically by `@conciv/it`; do not
install directly.

## Transport tiers

The core binds `127.0.0.1` only. How the in-app WebView reaches it depends on the
target. Only the iOS simulator tier ships today; the rest are documented for the
follow-on milestones.

| Target                  | How the WebView reaches the core                                   | Status                          |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------- |
| iOS simulator           | `http://127.0.0.1:<port>` directly (shared host loopback)          | Shipped                         |
| Android emulator        | `http://10.0.2.2:<port>` (emulator alias for the host loopback)    | Documented, sibling extension   |
| Android physical device | `adb reverse tcp:<port> tcp:<port>` then `http://127.0.0.1:<port>` | Documented, sibling extension   |
| iOS physical device     | LAN bind + token, or QR pairing, or Bonjour (all token-gated)      | Deferred (no code in this tier) |

## Dev loop and port

Pin a stable core port so the simulator always loads the same URL. `ConcivConfig`
already accepts a `port`; the ios dev loop pins `4599` by default. With a pinned
port, restarting the same core needs no change in the app.

`ios.run` injects the core native page URL into the launched app as
`SIMCTL_CHILD_CONCIV_URL` (the app reads it as `CONCIV_URL`). The value defaults to
the core's own apiBase plus the `/native` route, and carries the `/t/<token>` prefix
when the core minted an access token. Set `concivUrl` in the ios extension config to
override it.

## Pairing file and discovery

On startup a dev core that serves the native page writes
`~/.conciv/dev-endpoint.json` (`{apiBase, token, pid}`, mode `0600`, never logged)
and removes it on shutdown. The simulator shares the host filesystem, so the Swift
SDK reads that file to discover the core deterministically, validates it with
`GET <apiBase>/health`, and falls back to probing a short candidate port list on
`127.0.0.1` (the pinned `4599` first). `apiBase` already carries `/t/<token>` when the
core is token-scoped, so the WebView loads `<apiBase>/native` token-scoped with no
extra work. The origin pin stays `scheme://host:port`.

## Auth and re-pair

Pure loopback on the simulator needs no auth. Once the connection leaves the machine
a token is required, and the core scopes the whole app under `/t/<token>` (path
prefix, not a header). The token persists for the core process lifetime and is
regenerated on restart, so a cached token that no longer resolves returns `401`/`404`
on the token-scoped base. The SDK treats that as a stale token and surfaces a visible
re-pair prompt; tapping it re-reads the pairing file and re-attaches. There is no
silent token refresh, and the token never appears in any log line.

Same-core port drift self-heals without relaunch: when the current base stops
responding, the SDK re-discovers and, if the pairing-file `pid` is unchanged (the same
core process), re-sends the handshake so the page rebinds in place. A different `pid`
is a fresh mount at the new origin.
