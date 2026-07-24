# 00 — Overview

> **Review fixes (review-01-codex): B1, B2, B3, B4.** Corrected the "unmodified global bundle" claim
> (the native path loads a **native embed entry**, not `conciv-widget.global.js`), rewrote the grab and
> apiBase hack→seam rows to describe the host-level `grabProvider` (B1) and the before-mount/rebind
> apiBase lifecycle (B2), pointed delivery at a native entry + plugin `clientEntries` (B3), and updated
> the runtime diagram to drop the never-installable "client merges GrabApi" path.
>
> **Review fixes (review-02/03/04): DELIVERY PIVOT (D1), grab seam single-source (D1/M-A7/feasibility-3),
> host-context line (feasibility-trivial).** The **core-served native page is the sole v1 delivery**: the
> dev core serves a native host page, and the SDK's `WKWebView` just loads that URL. That collapses several
> earlier gaps at once — page origin == core origin (same-origin RPC/SSE, no null-origin pinning), and the
> `window.__CONCIV_GRAB_PROVIDER__` import-time seam is **DELETED**: `init.grabProvider` on the native page
> entry is the only grab seam (no import-time side-effect registration anywhere). Bundled host HTML is
> **out of v1** (moved to `10`). The old `host-context.ts:29` citation for insert/attach is corrected to
> **lines 25/26**.

## What we are building

The conciv widget (a Solid app that renders a chat panel + tool cards) already runs as a web overlay
on any page via `@conciv/embed`. The iOS extension brings the same experience into a native app:

- The **unforked** widget (same `@conciv/embed` app code, zero iOS branches) loads inside a
  transparent `WKWebView` that floats above real UIKit/SwiftUI screens. **The dev core serves a native
  host page** (built from a `src/native-entry.ts` in `@conciv/embed` via a `vite.native.config.ts`, `03`);
  the SDK's `WKWebView` simply loads that URL. The native entry passes the native `grabProvider`, the
  `apiBase`, and `settings.launcher` into `createConciv` (see `03` D1 / `05`). "Unmodified" was imprecise;
  the app code is unforked, the entry that wires it differs. **Core-served is the sole v1 delivery model**
  — there is no SDK-bundled host HTML in v1 (deferred, `10` Q7), so the page origin is the core origin and
  bridge messages are validated against that same origin (no null-`file://` origin to special-case).
- A **native grab pipeline** lets the user tap a real native view; the SDK captures it (text, rect,
  screenshot, a11y metadata) and hands it to the widget as a staged `Grab`, exactly like the web
  element-picker does today.
- A set of **first-class `ios.*` tools** (build, run, screenshot, logs, view-hierarchy) let the agent
  drive the simulator build/run/inspect loop from inside the chat, so an agent can edit Swift and see
  the result.

The spikes proved every mechanism end to end. This plan replaces the spike hacks with first-class seams
so the result is production-grade and lives in the monorepo alongside the terminal/whiteboard extensions.

## Spike verdicts (2026-07-23, iOS 26.5 simulator) — all PASSED

1. **Widget bundle runs unmodified in `WKWebView`.** Mount ~770ms, SSE streams, tool calls render, Ark
   popovers position correctly. `NSAllowsLocalNetworking` in ATS is sufficient for loopback; no other
   entitlement needed. → We do **not** fork the widget for iOS.
2. **Transparent overlay works.** `webView.isOpaque = false` + clear `backgroundColor` on the web view
   and its `scrollView` + a transparent host HTML page → native UI shows through; the widget panel
   floats above real UIKit screens. Full recipe in the appendix.
3. **Native grab pipeline works** (spike-grade): pick overlay → recursive hit-test → `drawHierarchy`
   capture → deliver JSON to the page → page injects into the composer. Every mechanism is a hack to be
   replaced by a first-class seam (map below).
4. **Edit loop is fast.** `swiftc` direct build (no `.xcodeproj`) + `simctl install`/`launch` gives a
   3-4s rebuild→relaunch cycle. A widget-embedded agent can drive it with a single Bash approval today;
   this plan promotes it to typed `ios.*` tools so it needs no approval and validates inputs.

## Hack → first-class seam map

Each spike hack and the seam that replaces it. The "where" column points at the plan file that designs it.

| Spike hack                                                                                                         | First-class seam                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Where            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Page intercepts the grab button by `aria-label` and `postMessage`s `grab.pick`                                     | **Host-level `grabProvider` seam (single source: `init.grabProvider`).** The `grab` context is built by `makePaneGrabApi` (`apps/conciv/src/extension/pane-grab.ts:5`), which hardwires the web `@conciv/page` adapter; an extension `.client()` cannot replace it (it only returns `value`, `define-extension.ts:117`). Add `ConcivInit.grabProvider` (`packages/embed/src/mount.ts:8`) → router context → `makePaneGrabApi` uses it when set. The **core-served native page entry** passes `grabProvider: makeNativeGrabProvider()` into `createConciv`. The old `window.__CONCIV_GRAB_PROVIDER__` import-time seam is **deleted** (single seam, no import-order race — D1/M-A7/feasibility-3). | `03`, `05`       |
| `ElementSnapshot.node: HTMLElement` in `packages/grab/src/grab.ts:2` leaks DOM into the contract                   | Host-neutral `Grab` payload; web keeps its DOM node inside the `dom` preview arm only. **Phase 0, blocks everything.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `01`             |
| Native result injected into composer via textarea value-setter + `DataTransfer` on the file input (`overlay.html`) | `HostWiring.insert(text)` / `HostWiring.attach(file)` (already in `host-context.ts:25,26`) driven by the bridge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `02`, `04`, `05` |
| `setInterval` dispatching `conciv:open-panel` until the panel opens (`overlay.html`)                               | First-class open/close signal for embedded hosts; `defaultOpen` currently only fires when `route === '/'` (`apps/conciv/src/routes/__root.tsx:198`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `05`             |
| Grab payload had **no source mapping** → agent said "not in this repo" and could not act                           | Source-context registration: extension registers native project root + scheme; per-view a11y-id convention as v1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `03`, `10`       |
| Hardcoded `pw-api-base` meta broke when the dev core moved ports twice                                             | **Same-origin base + same-core rebind (D1/D8).** The core serves the native page, so the initial base is the page's own origin (`window.location.origin` into `init.apiBase`) — no `documentStart` injection needed. `handle.rebind(apiBase)` re-binds on **same-core port drift only** (recreates page plane, re-points rpc, clears query cache, re-runs connected effects via a connection-generation signal); a different core = fresh mount. Discovery/token via probe precedent (`packages/extensions/try-it/src/shared/probe.ts`).                                                                                                                                                          | `02`, `05`, `06` |
| Dual launchers (web mascot FAB + native FAB)                                                                       | `launcher: 'native' \| 'mascot' \| false` mount option (D17): `'native'` (SDK default) suppresses the web mascot so only the native FAB shows; `'mascot'` keeps the web mascot as the launcher inside the native host (native shrinks the WebView touch region to the mascot rect when closed); `false` = no launcher                                                                                                                                                                                                                                                                                                                                                                             | `05`             |
| WebView covers the whole screen; touches never reach native UI when panel is closed                                | SDK `hitTest` override so touches outside the panel fall through to native                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `04`             |
| Grab button silently no-ops when the host has no grabbable surface                                                 | Capability-driven enable/disable of the grab affordance (web too)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `05`             |
| Widget panel clips at 393px width                                                                                  | Mobile-width responsive pass in the widget — **separate prerequisite PR**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `05`             |

## How the pieces fit at runtime (target state)

```
Native app (iOS)
├─ Real UIKit/SwiftUI screens
├─ ConcivWidget SDK (Swift, #if DEBUG) — source in monorepo native/swift/, consumed via conciv-swift mirror (D2)
│   ├─ Native FAB (launcher:'native')  ──tap──► ensure-open  (JS via evaluateJavaScript)
│   ├─ Transparent WKWebView (isOpaque=false)
│   │    └─ loads the CORE-SERVED native page: http://127.0.0.1:<port>/<native-page-route> (D1)
│   │         └─ page = @conciv/embed src/native-entry.ts (vite.native.config.ts), sole v1 delivery
│   │              └─ createConciv({extensions:[iosClient], settings:{launcher:'native'},
│   │                   apiBase, grabProvider: makeNativeGrabProvider()})  (D1)
│   │                   └─ iosClient installs window.__concivNative + posts bridge.ready (re-posted
│   │                        until first acked N→P call — M-A4/D4)
│   ├─ Bridge handler (WKScriptMessageHandler "concivBridge")
│   │    ├─ origin-pinned to the CORE origin + main-frame-only; removed on detach (M6; page==core origin, D1)
│   │    ├─ webViewWebContentProcessDidTerminate ──► crashed → reload → fresh handshake (B-A1/D4)
│   │    ├─ receives {type:'grab.pick', requestId} ──► enters native pick mode (SINGLETON, M-A6/D10)
│   │    ├─ queues Native→Page calls until bridge.ready, acks each (M7); handshake retried-until-acked (M-A5/D4)
│   │    └─ delivers grabResult {requestId, grab (subtree folded into grab.text, D6)} ──► window.__concivNative.grabResult(...)
│   └─ hitTest override: touches outside the live region → nil → fall through to native
│        (region = full panel when open; mascot rect when launcher:'mascot' + closed, D17)
│
└─ Desktop dev machine
    └─ conciv core (Hono server, 127.0.0.1:<port>)
         ├─ serves the native host page (D1) + chat / SSE / MCP  (same origin the WebView talks to)
         ├─ optional /t/<token> scoping via core start.ts (start.ts:93-99) for non-loopback (06/D13)
         └─ @conciv/extension-ios (server): ios.build/run/screenshot/logs  (NO viewHierarchy in v1, B4)
              └─ child_process → xcodebuild / simctl (DEVELOPER_DIR handled)
```

The core server and the simulator are on the same machine in the sim workflow, so the WebView reaches the
core over `127.0.0.1` and the served page and its RPC/SSE share one origin (D1 — no cross-origin, no
null-origin). On a physical device, `06` covers the tunnel/pairing. The `ios.*` server tools run in the
core process; the native grab/bridge lives in the WebView and reaches the agent only through the grab
payload (there is no server→WebView push in v1, B4).

## Non-negotiable repo rules that shape this plan

From `AGENTS.md` and the project memory — the implementing agents must honor these or CI blocks them:

- **Functions, not classes** (TS). Swift is exempt (UIKit forces subclassing `UIView`/`UIViewController`).
- **Zero code comments in TS/JS** — the `conciv/no-comments` lint autofix deletes them. Write
  self-explanatory code. (Swift may carry comments.)
- **zod validates every HTTP/tool boundary.** New tool inputs and bridge messages get zod schemas.
- **Real browser tests only** (Playwright/Chromium), never jsdom. Widget ITs load the prebuilt bundle.
- **Every Solid package `vitest.config.ts` pins `test: {environment: 'node'}`** or the run exits 1.
- **New published package** ⇒ add to `PUBLIC_PACKAGES` (`packages/publish/src/guards.ts:18`) and fallow
  `publicPackages` (`.fallowrc.json`), give it `homepage`/`repository.directory`. See `08`.
- **`@conciv/*` version in lockstep** via `.changeset/config.json` `fixed: [["@conciv/*"]]`. One changeset
  releases the set.
- **No em dashes on live surfaces** (recent `chore: purge em-dashes` commit) — applies to prompt strings,
  tool descriptions, UI copy. Use hyphens or rephrase.
- **Run `pnpm exec fallow audit --changed-since main --format json`** before finishing; fix anything
  INTRODUCED.
