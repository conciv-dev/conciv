# 10 — Open questions

> **Review fixes (review-01-codex): B4.** Q3 is rewritten: `ios.viewHierarchy` is **cut from v1** (no
> `simctl` fallback exists; no server→WebView push for extension tools), replaced by the grab-attached
> subtree + `ios.screenshot`; the deferred agent-pulled route is specified concretely here. Several former
> "open" items are now **decided** by the redesign and marked as such below (grab seam B1, apiBase
> lifecycle B2, delivery B3, SwiftPM B5).
>
> **Review fixes (review-02/03/04): delivery pivot dissolves items (D1), new open questions, Q4/Q7
> updated.** The **core-served native page is the sole v1 delivery**, so the bundled-host-HTML question
> (Q7) is now genuinely **deferred/open** (there is no bundled host in v1), and the SwiftPM question is
> resolved via the D2 hybrid. New open questions: **multi-device session isolation** (Q11), a **typed
> attachment/content part for the structured subtree** (Q12), and **capability-scoped tool loading** (Q13,
> deferred out of M0-M5).

Genuinely undecided items. Each carries a recommendation so the orchestrator can resolve or defer.

## Resolved by the redesigns (no longer open)

- **Grab injection (B1):** decided — host-level `grabProvider` on `ConcivInit`, threaded to
  `makePaneGrabApi`; not an extension-value merge (`03`/`05`). The `window.__CONCIV_GRAB_PROVIDER__` seam is
  **deleted** — `init.grabProvider` is the only seam (D1/M-A7).
- **apiBase lifecycle (B2 / D8):** decided — under the D1 core-served page the initial base is the served
  page's own origin (same-origin); `handle.rebind(apiBase)` handles **same-core port drift only** (nav/session
  preserved), a different core = fresh mount (`02`/`05`/`06`).
- **Delivery (B3 / D1):** decided — the **core serves a native page** built from
  `packages/embed/src/native-entry.ts` (`vite.native.config.ts`); it is the **sole v1 delivery**. No
  SDK-bundled host HTML in v1 (old Q7 → deferred/open below).
- **SwiftPM layout (B5 / D2):** decided — **hybrid**: source of truth in the monorepo (`native/swift/`,
  nested manifest, no root `Package.swift`, no bare-semver tags), distribution via a **mirror repo**
  `conciv-dev/conciv-swift` that release CI publishes (root manifest + bare-semver tags). Kills the M-A9
  one-way door (`04`/`08`).
- **Bridge robustness / SwiftUI selection / subtree transport (D3-D6, D10-D11):** decided — version
  negotiation + additive tolerance + decode-equivalence (`02`/`07`); crashed-state recovery + set-state
  open/close + retried handshake (`02`/`04`); UIKit hit-test + SwiftUI SDK-owned anchors, no a11y-tree walk
  (`04`); subtree folded into `grab.text` (`02`/`03`); singleton native pick (`02`); shared bridge-client
  state machine (`02`/`09`).

## Q1 — Grab preview: discriminated union vs. always-image

**Question.** Should the neutral `Grab.preview` be a `dom | image` union (web keeps its DOM clone) or
always an image (web rasterizes)? Detailed tradeoff in `01`.
**Recommendation.** Discriminated union. Preserves web fidelity with zero rasterization; `HTMLElement`
stays confined to the web-only `dom` arm and never crosses the bridge. Define the acceptance criterion as
"no DOM type in any value that crosses the bridge or that a non-web host constructs," which the union
satisfies. **Lowest-risk, recommended to lock now** — it is the Phase 0 blocker.

## Q2 — SwiftUI source context has no runtime answer

**Question.** SwiftUI exposes no `file:line` for a rendered view at runtime. How does the agent locate the
tapped view in the codebase?
**Recommendation.** Layered, ship v1 with the cheapest: (v1) register project root + scheme and let the
agent grep `class <Name>`; (v1.5) document an `accessibilityIdentifier` convention the SDK forwards and
the agent greps; (v2) build-time SourceKit/indexstore index resolving symbol→`file:line`. The Phase 0
`source` fields already accommodate all three, so no further contract change is needed to upgrade later.
Android gets this accurately for free via Compose source info (`09`) — do not block iOS on matching it.

## Q3 — Agent-pulled view hierarchy (deferred; v1 uses grab subtree + screenshot) — B4

**Question.** How does the agent get a structured view tree of the current screen?
**What v1 does (decided).** There is **no `ios.viewHierarchy` tool** in v1. The two proposed sources both
fail: `xcrun simctl ui` sets UI _preferences_, not a view/accessibility tree (no `simctl` hierarchy dump
exists), and a live-SDK pull would require the core (where server tools run,
`packages/core/src/app.ts:101`) to push a request into the WebView process and await a native answer — the
extension tool runtime has **no** such server→WebView channel (the only out-of-band path is
`conciv_ui`/`uiReply`, driven by an agent tool call the client observes on the attach stream, not a
server-tool pull). So `host.dumpHierarchy` is **not** added to `02`. v1 gives the agent screen context via
`ios.screenshot` (an `imageResult` image, M10) plus the bounded `NeutralGrab.subtree` captured at pick time
(`02`, client→server over the grab path — no new channel).
**Deferred design (when agent-pulled full-screen hierarchy is worth building).** Two viable routes, pick at
that time:

1. **Out-of-band request modeled on `conciv_ui`.** Introduce a pending-request table the ios client
   observes on the attach stream (like `pendingUiCallIds`, `packages/core/src/chat/gate.ts:97`); the client
   forwards the request over the bridge (`host.dumpHierarchy` request with `requestId` + timeout + error
   shape), native collects the tree (the **UIView tree + the SwiftUI anchor registry**, D5 — there is no
   general in-process accessibility tree to walk) and returns it, the client replies via an RPC (like
   `uiReply`, `packages/core/src/api/rpc/chat.ts:30`); the server tool awaits the reply. This reuses the
   existing out-of-band plumbing pattern rather than inventing a socket.
2. **XCUITest accessibility snapshot.** A server-side `xcodebuild test`/XCUITest target dumps the
   accessibility hierarchy **out of process** (the one place a full SwiftUI a11y tree IS available, D5),
   without the WebView at all. Heavier harness, but no client round-trip and no in-process a11y-tree
   assumption.
   Track as a follow-on milestone; do not block v1.

## Q4 — Where does the token ride: path prefix or header? (RESOLVED to path-prefix, D13)

**Question.** Auth token as `/t/<token>` path prefix or as an `Authorization`/`x-conciv-token` header?
**Answer (corrected against code, D13/feasibility-5).** **Path prefix.** Core already mounts the WHOLE app
under `/t/<accessToken>` when `accessToken` is set (`packages/core/src/start.ts:93-99`,
`new Hono().mount('/t/'+token, app.fetch)`), and the `@conciv/try` connect flow drives exactly this
(`connect.ts` → `start({accessToken})`; `cli.ts` → `/t/<token>/api/mcp`). So path-prefix scoping of the
full RPC surface is **proven, zero-new-code**. A header is the ALTERNATIVE and is **more** work (no
token-validation middleware exists — the secret is the path), justified only if a future need forbids the
token in a URL. The earlier "confirm the core routes /t/ for the full surface" caveat is **resolved: it
does.**

## Q5 — hitTest passthrough: modal-when-open, or true partial passthrough?

**Question.** When the panel is open, should the whole overlay capture touches (modal) or only the panel
rectangle (native UI behind it stays live)?
**Recommendation.** v1 modal-when-open (whole overlay hit-testable while open, only the FAB while closed)
— simplest correct behavior, matches the web modal panel. True partial passthrough (grab a native view
_while_ the panel is open) is nicer but needs the SDK to know the panel's exact rect over the bridge;
defer to a follow-on once `host.panelToggled` carries panel bounds.

## Q6 — One extension with a `platform` config, or `extension-ios` + `extension-android`?

**Question.** iOS and Android as one extension or two (`09`).
**Recommendation.** Two extensions sharing a common tool-logic module + per-platform runner seams. Keeps
each publishable package focused, matches the sibling-per-concern convention (terminal/whiteboard/recorder
are separate), and the runner seam is where they legitimately diverge. Revisit if the shared module ends
up being 90% of both.

## Q7 — SDK-bundled host HTML (DEFERRED — not in v1, D1)

**Question.** Should the SDK ever embed its own transparent host HTML that mounts `@conciv/embed` and
points at the core apiBase (for offline/device scenarios where there is no core-served page)?
**Decision (D1).** **Not in v1.** The **core-served native page is the sole v1 delivery** — the WebView
always loads the core URL, so the page origin == core origin (same-origin RPC/SSE, single origin to pin, no
null-`file://` case, M-A12 dissolved). A bundled host HTML would reintroduce the null-origin pinning problem
and a second delivery surface, so it is **deferred**. If a genuinely offline/no-core scenario appears later,
revisit: it would need its own transparency host + explicit `__CONCIV_API_BASE__` injection + null-origin
CORS/SSE handling. Tracked here; do not build for v1. (This also dissolves codex-02 new-B4: there is no
bundled host HTML to ship as a SwiftPM resource in v1.)

## Q8 — Physical iOS transport (LAN vs QR vs Bonjour)

**Question.** How does a physical iPhone reach the loopback-bound core?
**Recommendation.** Defer past the sim milestones. When needed, ship LAN-bind (dev-flag, token-gated) +
Expo-style QR pairing first; consider Bonjour later. Details in `06`.

## Q9 — `ios.inject` (dyld hot-swap) scope

**Question.** How far to take the `-interposable` dyld hot-swap tool (`03`)?
**Recommendation.** Park it entirely until the `build`/`run`/`inspect` loop is solid and manually
verified. It is an optimization on cycle time, not a capability gate; the 3-4s `swiftc` relaunch is
already fast enough for v1.

## Q10 — AGENTS.md gate paths are stale

**Observation (not a decision).** AGENTS.md "Security & safety" cites
`packages/core/src/api/chat/permission.ts` + `packages/core/src/policy/command-policy.ts` for the Bash
gate, but the live code is `packages/core/src/chat/gate.ts` (`classifyCommand` at line 44,
`makeConcivSandbox` at 227, `makeRunGate` at 207). The task brief already flagged this. **Recommendation:**
a trivial docs PR to fix the AGENTS.md paths, independent of this work, so future agents find the gate.
Not required for the iOS extension, but cheap to land while the context is fresh.

## Q11 — Multi-device session isolation (D13 / M-A11)

**Question.** When two devices drive the same core, how are their sessions kept isolated so they do not
cross-fire?
**Recommendation.** v1 is **single-device**; `handshake.hello` already carries a per-page `clientId` (`02`)
as the hook for later. When multi-device is built, follow the **recorder `clientId` precedent** (memory:
recorder clientId pinning) to scope streams/sessions per device. **Open** — do not build for v1, but the
`clientId` field is in the wire now so adding isolation later needs no protocol break.

## Q12 — Typed attachment/content part for the structured subtree (D6)

**Question.** v1 folds the bounded view subtree into `grab.text` (the only path proven to reach the model,
D6). Should the structured `ViewNode` subtree instead ride as a typed attachment/content part so the model
gets structure without prose?
**Recommendation.** **Open/deferred.** A typed content part (or an extension attachment expander) would let
the agent consume the tree structurally and would keep `grab.text` clean, but it needs a real model-visible
content representation and a send path that survives the `grab.text`-only reduction
(`apps/conciv/src/chat/chat-pane.tsx:341`). Ship the folded-text version in v1 (demonstrably reaches the
model); design the typed part when a consumer needs machine-readable structure. The `NeutralGrab.subtree`
field is retained now, so the data exists to upgrade later.

## Q13 — Capability-scoped tool loading (D17b — deferred out of M0-M5)

**Question.** An iOS-hosted session should not be advertised web/page tools (or vice versa) — e.g. the DOM
`page` tool is meaningless in a native host, and `ios.*` tools are meaningless on web. How does the core
avoid advertising irrelevant tools per host?
**Recommended design.** The **host/client declares its capabilities at session start** (a small capability
set on the attach/handshake, e.g. `{host: 'native-ios' | 'web', surfaces: [...]}`), and the **core filters
the advertised tool list** (`buildChatTools` / the `toolList` assembly in `packages/core/src/app.ts:242`)
to those matching the declared capabilities. Extensions already self-describe their tools (memory:
no-central-catalog, no-tool-registry), so the filter is a capability predicate over the existing
self-described set, not a new registry. **Explicitly deferred out of M0-M5** — v1 advertises the full set
and relies on the system prompt to keep the agent on-task; capability-scoping is a follow-on once both web
and native hosts share a core. Noted here so M0-M5 does not accidentally hard-code host assumptions that
would block it.
