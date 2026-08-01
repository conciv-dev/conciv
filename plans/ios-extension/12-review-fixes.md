# PR #143 review fixes: 17 outstanding Copilot findings

Verified against head `97ca1ca2`: each item below is a real, still-present issue. Comment IDs
reference the PR review threads. Grouped into five workstreams; each is independently landable.
Workstream E (rebind-stale extension surfaces) is pre-existing widget infrastructure, not
iOS-specific, and can land as its own PR.

Repo hard rules apply throughout: no comments, no `as`, no `else`, no classes, functions only,
tests in real browser where UI is involved, `pnpm exec fallow audit --changed-since main` before
finishing.

---

## Workstream A: Swift SDK capture correctness

### A1. `drawHierarchy` result ignored (comments 3643591274, 3653060747)

`native/swift/ConcivWidget/Sources/ConcivWidget/Capture.swift:36,46` — both `renderView` and
`renderHostView` call `drawHierarchy(in:afterScreenUpdates:)` inside `UIGraphicsImageRenderer`
and discard its `Bool`. A UIKit-reported render failure produces a valid-looking `UIImage` of
blank pixels, which `imagePreview` (lines 62-65) happily converts to a JPEG data URL, so the
pick "succeeds" with a blank preview instead of failing closed.

Fix:

- Change both renderers to capture the result:
  ```swift
  var rendered = false
  let image = renderer.image { _ in
    rendered = view.drawHierarchy(in: bounds, afterScreenUpdates: true)
  }
  guard rendered else { return nil }
  ```
- Both functions already return `UIImage?`; the existing `guard let` chains in `imagePreview`
  and the pick paths in `OverlayController.swift:537-540, 551-554` then resolve the pick with
  `grab: nil, reason: .failed` for free. No caller changes needed.
- Verify: unit-test in the Swift package if a failing render can be simulated (offscreen /
  zero-size view); otherwise assert the guard exists via the bridge conformance fixture that
  exercises the failed-pick path.

### A2. `pickCollectTexts` walks hidden subviews (comment 3653060753)

`native/swift/ConcivWidget/Sources/ConcivWidget/PickMode.swift:53-61` — the text walk recurses
into every subview. `pickSearch` (line 37) and `pickBuildViewNode` (line 70) both skip
`isHidden` and `alpha < 0.02` views; the text collector does not, so reused cells leak stale
hidden label text into the grab sent to the agent.

Fix:

- Extract the shared visibility predicate used by `pickSearch`/`pickBuildViewNode` into one
  helper, e.g. `pickIsVisible(_ view: UIView) -> Bool`, and gate the `walk` recursion in
  `pickCollectTexts` on it:
  ```swift
  func walk(_ node: UIView) {
    guard pickIsVisible(node) else { return }
    ...
    for child in node.subviews { walk(child) }
  }
  ```
- Use the identical thresholds so all three walks agree (single source of truth; don't
  duplicate the `0.02` constant three times).

### A3. Ack-timeout drops non-critical calls with no retry (comment 3650655359)

`native/swift/ConcivWidget/Sources/ConcivWidget/BridgeHandler.swift:256-258` — `scheduleRetry`
re-dispatches only `isCritical` handshake calls; any other unacked call (including `grabResult`)
is silently removed at the first ack timeout. `PendingOutbound` (lines 83-86) has no attempt
counter. The bridge protocol doc promises a bounded retry before dropping. A transient
`evaluateJavaScript` hiccup therefore loses a grab result permanently and the page-side pick
promise hangs until its own timeout.

Fix:

- Add `var attempts: Int = 0` to `PendingOutbound`.
- In the ack-timeout path: if `attempts < maxAckRetries` (constant, suggest 2), increment,
  re-dispatch the same call (same seq, same epoch guard), and re-arm the timer. Only after
  exhausting retries remove it, and log via the existing `reportDispatchFailure` (lines
  246-249) so a dropped `grabResult` is at least observable — extend `reportDispatchFailure`
  to cover the timeout-exhausted path, not just `evaluateJavaScript` errors.
- Keep the epoch check on re-dispatch: a superseded epoch must still drop immediately (that
  path is correct today, don't retry across rebind/reload).
- Verify: bridge conformance test with an initially-unresponsive page that acks on the second
  delivery; assert `grabResult` arrives.

### A4. Repair banner captures all touches forever (comment 3652984747)

`native/swift/ConcivWidget/Sources/ConcivWidget/OverlayController.swift:369` sets
`container.state.panelOpen = true` for the repair prompt, and `LiveRegion.swift:16-21,45` maps
`panelOpen` to `.fullPanel`, which makes the transparent WKWebView consume every touch in the
window. If discovery gives up (`OverlayController.swift:317-322` leaves the prompt up), the
host app is permanently non-interactive — a direct violation of the overlay's passthrough
contract.

Fix:

- Introduce a dedicated hit-region state for the banner instead of reusing `panelOpen`. Add a
  `bannerRect: CGRect?` to the live-region state and a `.banner(CGRect)` case (or reuse the
  existing rect-based mechanism used for the FAB, `fabRect`) so only the banner's frame is
  interactive; everything else passes through.
- On `gaveUp`, either keep the banner tappable-only-within-its-rect (acceptable), or add an
  auto-dismiss with a "retry" affordance. Minimum fix is the hit-region change; the banner may
  stay visible but must never block the host outside its own bounds.
- Verify: extend the Swift overlay hit-testing test (or the simulator harness check) asserting
  a point outside the banner rect passes through while the prompt is showing.

### A5. Pick close button invisible to VoiceOver (comment 3653060748)

`native/swift/ConcivWidget/Sources/ConcivWidget/OverlayController.swift:492-497` — the pick
chrome close button exposes only the glyph `✕`. Set
`button.accessibilityLabel = "Cancel selection"` (match the wording used elsewhere in the SDK;
the FAB already sets labels at lines 175 and 423 — follow that pattern).

---

## Workstream B: `ios.*` tool diagnostics and build coverage

All in `packages/extensions/ios/src/server/tools.ts` unless noted.

### B1. `resolveAppPath` never checks the artifact exists (comment 3652539583)

`tools.ts:268-271` returns the computed `.app` path (swiftc: `join(projectDir, 'build',
moduleName + '.app')`; xcodebuild: settings-derived) without an existence check, so a missing
artifact bypasses the `artifact` failure branch (lines 335-337) and surfaces later as a
misleading `install`-stage failure (lines 338-341).

Fix:

- `existsSync` is already imported (line 2). After computing the path, return a discriminated
  result (`{ok: true, appPath} | {ok: false}`), or keep returning the path and add the check
  at the single call site so the `artifact` branch fires with a diagnostic naming the missing
  path and the mode (swiftc vs xcodebuild) that produced it.
- Verify: extend `packages/extensions/ios/test/server-tools.test.ts` with a configured-but-
  never-built project asserting stage `artifact` (not `install`).

### B2/B3. Empty diagnostics on unparseable failures (comments 3652939405, 3652939411)

- `tools.ts:187-188`: nonzero `swiftc` exit returns `parseDiagnostics(...)` raw. A generic
  stderr (SDK missing, bad invocation) matches nothing, so the build fails with an EMPTY
  diagnostics array.
- `tools.ts:217-219`: `packagingDiagnostics` (used for the plutil failure at 204 and codesign
  failure at 212) has the same gap.

Fix:

- The fallback already exists: `reportedDiagnostics` (tools.ts:312-320), used for xcodebuild
  (line 139) and the sdk-path probe (line 155). Route both remaining sites through it: when
  `parseDiagnostics` yields `[]` on a failed command, emit one bounded diagnostic carrying the
  command name and truncated stderr (reuse the existing truncation bound).
- Fold `packagingDiagnostics` into the same helper — after this change it is likely a
  one-liner; delete it if fallow flags it.
- Verify: two unit tests — swiftc failure with non-diagnostic stderr, codesign failure — both
  asserting `diagnostics.length > 0` and that stderr content is present.

### B4. swiftc mode can't build the shipped demo (comment 3652984737)

`tools.ts:71-75` (`collectSwiftSources`) walks only `<projectRoot>/Sources`. The shipped
`ConcivDemo` (wired in `apps/examples/tanstack-start/vite.config.ts:27-31`) references
`ConcivWidget` and `.concivGrab`, and its working `build.sh` also compiles
`../ConcivWidget/Sources/ConcivWidget`. So `ios.build` in swiftc mode fails on the very demo
the PR ships; the current "mitigation" is a system-prompt note telling the agent to run
`build.sh` instead (`meta.ts:45-50`) — a workaround, not a fix.

Fix:

- Add an optional `extraSourceDirs: z.array(z.string()).optional()` to the ios extension config
  (`packages/extensions/ios/src/shared/meta.ts:8-16`), resolved relative to `projectRoot`.
  `collectSwiftSources` becomes `[join(root, 'Sources'), ...extras].flatMap(walkSwiftSources)`.
- Wire the demo config with `extraSourceDirs: ['../ConcivWidget/Sources/ConcivWidget']` in
  `apps/examples/tanstack-start/vite.config.ts` so `ios.build` on the demo actually works.
- Remove the build.sh workaround sentence from the system prompt in `meta.ts:45-50` once
  `ios.build` succeeds (keep build.sh itself for humans).
- Verify: server-tools test with a fixture split across two source roots compiles both.

### B5. `concivUrl` accepts a `/native` URL that double-appends (comment 3652939423)

`packages/extensions/ios/src/shared/meta.ts:15` — `concivUrl: z.string().url().optional()`
passes straight to `SIMCTL_CHILD_CONCIV_URL` (tools.ts:279-280); Swift's `Discovery.pageURL`
appends `/native` (Discovery.swift:53-55). A plausible hand-set value like
`http://127.0.0.1:4599/native` yields `/native/native` and a blank overlay. Docs-only guard
today (README.md:67, Discovery.swift:98-103).

Fix:

- Normalize at the zod boundary: `.transform` that strips a single trailing `/native` (and any
  trailing slash) with a `.refine` rejecting anything else path-suffixed weirdly — the config
  value is defined as a bare API base, so silently correcting the one documented foot-gun and
  rejecting other paths is the conservative shape. Keep the error message pointing at the
  README rule.
- Verify: meta schema unit test — bare base passes unchanged, `/native`-suffixed input
  normalizes, `/native/x` rejects.

---

## Workstream C: test hygiene

### C1. IT clobbers the developer's live pairing file (comment 3653060743)

`packages/plugin/test/native-page-vite-boot.it.test.ts:41-44` enables `nativePageDir`, so
`start()` writes `~/.conciv/dev-endpoint.json` (start.ts:138-143); teardown then deletes it.
The pid guard (`dev-endpoint.ts:51-54`) doesn't help — the test process is the writer. Running
this test locally while a real dev core is up destroys the live pairing.

Fix:

- The core tests already solve this with a `devEndpointDir` override; the plugin surface
  (`packages/plugin/src/core/vite.ts:128,218`, `boot.ts:22`) doesn't expose it. Thread
  `devEndpointDir` through the plugin's core-boot options (plumbing only, default unchanged)
  and set it to a per-test temp dir in this IT — same pattern the core tests use.
- Verify: run the IT while a dummy `~/.conciv/dev-endpoint.json` exists; assert it is untouched.

---

## Workstream D: release plumbing — no action

Comment 3646009361 (release.yml path filter) was re-verified as ADDRESSED at head: the path
filter is gone; the mirror job now gates on npm-published-version instead. Listed here only so
nobody re-opens it from the stale thread.

---

## Workstream E: rebind leaves extension surfaces on the old core

(comments 3652539543, 3652539555, 3652539558, 3652939394, 3652539569)

Shared root cause, pre-existing and NOT iOS-specific: `rebind()`
(`packages/embed/src/mount-impl.tsx:93-102`) bumps `connectionGeneration`, but only the chat
pane is keyed by it (`apps/conciv/src/routes/panel.$sessionId.index.tsx:11-15`). Extension
views (`panel.$sessionId.$view.tsx:83` mounts `MountedView` unkeyed) and global client surfaces
sample `apiBase()` once and keep RPC clients, SSE feeds, and poll loops pinned to the dead
port. The native path only survives because the Swift SDK reloads the entire document on
rebind (`OverlayController.swift:159-160`); the in-page rebind path is broken for:

1. Recorder capture driver — `capture-driver.tsx:10` passes `apiBase()` into `bootRecorder`,
   which builds a fixed client (`boot.ts:13-14`) and a persistent control loop.
2. Recorder panel — `panel-view.tsx:38` builds `makeExtRpcClient` once; 7s presence renew
   (line 46) and all queries keep the old base.
3. Whiteboard DB provider — `overlay.tsx:136` snapshot string; provider creates its client and
   change feed once.
4. Whiteboard comments provider — `overlay.tsx:107` same; `comments.tsx:367,373` takes
   `apiBase: string` and builds a fixed `ToolViewCtx` (comments.tsx:37).
5. Terminal mirror rail — `terminal-panel-view.tsx:166` plain string; `MirrorRail` connects in
   `onMount`; the existing `openKey` remount (line 211) keys on respawn/session, not base.

Fix — one mechanism, not five patches:

- Key the whole extension-view subtree by connection generation, mirroring the chat pane: in
  `panel.$sessionId.$view.tsx`, wrap `MountedView` in `<Show when={generationKey()} keyed>`
  (or add the generation to the existing keyed session `Show`), where `generationKey` combines
  session id + `connectionGeneration`. That single change remounts surfaces 2-5 with a fresh
  `apiBase()` on rebind — their once-per-mount client construction becomes correct instead of
  a bug.
- Surface 1 (capture driver) is a global client entry, not a routed view — it needs its own
  handling: subscribe to the same rebind signal (`conciv:rebind` event or the generation
  accessor threaded through client context) and tear down / re-boot the recorder loop with the
  new base. `bootRecorder` already returns its disposal (verify; if not, add one).
- Do NOT convert each provider to reactive-accessor plumbing internally — remount-by-key is
  the established pattern (chat pane precedent) and keeps providers simple.
- Decide-and-note: whiteboard remount mid-drag on rebind is acceptable (rebind is a
  failure-recovery path; dropped in-flight strokes are fine).
- Verify: widget IT — boot, open recorder panel + whiteboard, kill core, restart on new port,
  fire rebind, assert new-port requests (route through the harness diagnostics or a request
  log on the new core) and that presence/change feeds recover. Real browser, prebuilt embed
  bundle, `browser.newPage()`.

---

## Sequencing

1. E is the largest and independent — own branch/PR off `ios-extension` (or straight to main
   after #143 merges, since it's pre-existing breakage).
2. A1-A5 together (one Swift-side commit; A1+A2 are small, A3 needs the conformance test, A4
   needs the hit-region rework).
3. B1-B5 together (one tools/meta commit + tests).
4. C1 standalone (touches plugin options surface).
5. After each workstream: `pnpm typecheck && pnpm build`, targeted package tests via turbo,
   `pnpm exec fallow audit --changed-since main --format json` — fix INTRODUCED findings.
