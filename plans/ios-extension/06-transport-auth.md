# 06 — Transport & auth

> **Review fixes (review-01-codex): B2.** The "re-send handshake to re-bind" step is now backed by a
> concrete public API — `handle.rebind(apiBase)` (`05` 2b) — instead of assuming the embed can rebind an
> already-bound RPC client (it cannot: `mount-impl.tsx:54`, `contract/src/client.ts:26`). Discovery
> re-resolves a base; `handle.rebind` applies it with proper disposal.
>
> **Review fixes (review-02/03/04): token identity + lifetime (D13/M-A11), corrected /t/<token> rationale
> (D13/feasibility-5).** Added token lifetime/rotation/re-pair, a `clientId` in the handshake for future
> multi-device, and corrected the token-transport rationale. **Code-reality FLAG:** both the directive and
> feasibility-5 mis-stated where `/t/<token>` is served. It is **core routing** — `packages/core/src/start.ts:93-99`
> mounts the WHOLE app under `/t/<token>` when `accessToken` is set (`new Hono().mount('/t/'+token, app.fetch)`),
> and the `@conciv/try` connect flow already drives exactly this (`packages/try/src/connect.ts` passes
> `accessToken` to `start()`; `cli.ts` builds `/t/<token>/api/mcp`). So path-prefix scoping of the full RPC
> surface is **NOT new server work** — it exists and is proven. A header would be the NEW work (there is no
> token-validation middleware today; the secret IS the path). The recommendation below is corrected to the
> honest reality.

How the WebView reaches the conciv core across the environments, how the port-drift problem is solved for
good, and how auth works once the connection is not pure loopback.

## Loopback tiers

The core binds `127.0.0.1` only (security rule, `AGENTS.md`). Reaching it differs by target:

| Target                      | How the WebView reaches the core                                   | Notes                                                                                                               |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **iOS simulator**           | `http://127.0.0.1:<port>` directly                                 | The sim shares the host loopback. Proven in the spikes. `NSAllowsLocalNetworking` suffices (appendix `Info.plist`). |
| **Android emulator**        | `http://10.0.2.2:<port>`                                           | `10.0.2.2` is the emulator's alias for the host loopback (`09`).                                                    |
| **Android physical device** | `adb reverse tcp:<port> tcp:<port>` then `http://127.0.0.1:<port>` | `adb reverse` tunnels device loopback to host loopback over USB. Documented device path.                            |
| **iOS physical device**     | tunnel required (no `adb reverse` equivalent)                      | See "physical iOS" below; deferred past the sim milestones.                                                         |

The SDK's `apiBase` is whatever URL the tier dictates; the handshake (`02`) delivers it to the page so no
HTML is hardcoded.

## Stable port + the drift fix

**The spike failure:** the dev core restarted twice, each time on a random port, and the hardcoded
`pw-api-base` meta went stale. Two complementary fixes:

1. **Stable dev port.** `ConcivConfig` already has an optional `port` (`config-types.ts`). Recommend the
   ios dev workflow **pins a fixed port** (config or `--port`) so the sim always loads the same URL.
   Document a default (e.g. `4599`) for the ios extension's dev loop. This alone removes the common case.
2. **Discovery for the un-pinned case.** Reuse the existing probe precedent: `probeCore`
   (`packages/extensions/try-it/src/shared/probe.ts`) races `GET /t/<token>/health` across a small port
   list and returns the first healthy base. The SDK (or a native discovery helper) can do the equivalent —
   try a short candidate port range on `127.0.0.1`, pick the one whose `/health` responds
   (`packages/core/src/app.ts:132` serves `/health` with `{ok:true, harness}`). The handshake then
   delivers the discovered base. This mirrors what `@conciv/try` already does for the web connect flow.

**Recommendation:** pin a stable port for the sim dev loop (primary), keep probe-based discovery as the
fallback so a moved port self-heals without editing native code. When the **same core** re-resolves a new
base mid-session, native sends `handshake({apiBase: newBase})`; the ios client calls
**`handle.rebind(newBase)`** (`05` 2b), which recreates the page plane, re-points RPC/SSE, clears the query
cache, and bumps the connection generation — no app relaunch (validated by `04` AC4, D8). Switching to a
**different** core is a fresh mount (reload the WebView), not rebind. The initial base is the **served
page's own origin** (same-origin under D1, `02`); rebind is only
for drift.

### Pairing file (alternative discovery)

For robustness without a port scan, the core can write a small pairing file (e.g.
`~/.conciv/dev-endpoint.json` = `{apiBase, token, pid}`) on startup. A native discovery helper reads it.
This is the most deterministic option on the sim (shared filesystem with the host). Recommend offering it
alongside the probe; the sim can read the file, a device cannot (no shared FS) and falls back to
tunnel + token.

## Auth (token) — needed once non-loopback

Pure loopback on the same machine (sim) needs no auth: only local processes can reach `127.0.0.1`. The
moment the connection leaves the machine (physical device tunnel, or any non-loopback origin) a bearer
token is required.

- **Token issuance.** Core already scopes the whole app by token: `start()` mounts the app under
  `/t/<accessToken>` (`packages/core/src/start.ts:93-99`) and `@conciv/try` drives it end to end
  (`connect.ts` → `start({accessToken})`; `cli.ts` → `/t/<token>/api/mcp`; `probe.ts` → `/t/<token>/health`).
  The dev core generates a token, the SDK obtains it (pairing file, QR, or config).
- **Where the token rides — path prefix `/t/<token>` is the simpler v1 (corrected, D13/feasibility-5).**
  Because core already mounts the **entire** app (rpc, mcp, health, extension routes) under `/t/<token>`
  with **zero new server code**, the SDK simply loads the core-served native page at
  `http://127.0.0.1:<port>/t/<token>/<native-page-route>`; the page is same-origin under that prefix, so
  RPC/SSE are automatically token-scoped (the served page's own base already carries the prefix). A
  **header** (`x-conciv-token`) is the _alternative_, and it is **more** work, not less: there is no
  token-validation middleware today (the secret is the path itself), so a header path would require new core
  middleware to check and reject. Recommend **path-prefix for v1**; keep header as a documented alternative
  if a future need (e.g. a token that must not appear in a URL) justifies the new middleware.
- **Token lifetime / rotation / re-pair (D13/M-A11).** The token **persists for the core process lifetime**
  and is **regenerated on restart** (a fresh `accessToken` per `start()`). A device that cached the old
  token then hits a path that no longer exists → **404** (there is no partial-match; the whole app moved to
  the new `/t/<newtoken>` mount). The SDK treats a 404/401 on the token-scoped base as **stale token** and
  surfaces a **re-pair prompt**; the device re-pairs by re-reading the pairing file / re-scanning the QR
  (`06` pairing file). This is the honest recovery path — there is no silent token refresh.
- **`clientId` for future multi-device (D13/M-A11).** `handshake.hello` carries a per-page `clientId` (`02`)
  so a future multi-device setup can distinguish two devices driving the same core. **Multi-device session
  isolation is an OPEN question** (`10` Q11) — the recorder's `clientId` pinning is the precedent to follow
  when it is built; v1 is single-device.
- **Never log the token** (security rule). It is dev-only plumbing; keep it out of `host.log` forwarding.

## Physical iOS (later)

No `adb reverse` on iOS. Options, for a future milestone (tracked in `10`):

- **Same-Wi-Fi LAN.** Core binds an additional LAN interface (opt-in, dev-only, token-gated) and the SDK
  connects to `http://<mac-lan-ip>:<port>` with the token. Simplest; requires relaxing the strict
  loopback bind behind an explicit dev flag.
- **Expo-style QR pairing.** The core prints a QR encoding `{apiBase (LAN), token}`; the app scans it to
  configure `attach(apiBase:token:)`. Good DX, builds on the LAN option.
- **Bonjour/mDNS advertise.** The core advertises `_conciv._tcp`; the app browses and connects. Nicest
  zero-config DX; most work; needs `NSBonjourServices` + local-network permission.

**Recommendation:** ship sim + emulator + `adb reverse` first (covers the whole dev loop this plan
targets). Add LAN+QR for physical iOS as a follow-on; defer Bonjour unless demand appears.

## Acceptance criteria

- **AC1** — Sim: the WebView loads the core-served native page over a pinned `127.0.0.1:<port>` (initial
  base = the served page's own origin, D1); restarting the **same** core on the same pinned port needs no
  native change. Restarting on a different port self-heals via discovery + `handshake` + `handle.rebind`
  within one probe cycle, no relaunch (D8).
- **AC2** — No `apiBase` is hardcoded in any shipped Swift string; the WebView is pointed at a URL derived
  from discovery/pairing/config, and drift is handled by `handshake` + `handle.rebind`.
- **AC3** — With a token configured, the SDK loads the `/t/<token>/...` core-served page so RPC/SSE are
  path-scoped (core routing, `start.ts:93-99`); a request to the un-prefixed root 404s. A **stale** token
  (core restarted) 404s and the SDK surfaces a re-pair prompt (D13). Token never appears in logs.
- **AC4** — Android emulator variant reaches the core at `10.0.2.2:<port>`; device variant works after
  `adb reverse` (documented, `09`).
