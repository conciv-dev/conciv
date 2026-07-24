# 07 — Testing strategy

> **Review fixes (review-01-codex): B4, M11, M12.** The client IT asserts the **host-level `grabProvider`**
> path (not a defunct "extension merges GrabApi") and the `handle.rebind` flow; there is **no
> `ios.viewHierarchy` test** — screen structure is tested via `NeutralGrab.subtree` and `ios.screenshot`'s
> `imageResult` (B4); bridge conformance now tests **schema equivalence** (generated fixtures, strict
> unknown-key rejection, golden encode both sides) not just examples (M11); the Swift fixtures are a
> **committed copy with a CI drift-check**, not a cross-tree resource (M12).
>
> **Review fixes (review-02/03/04): conformance = decode-equivalence + roundtrip over a hand-maintained
> fixture table (D3), Swift conformance CI is REQUIRED (D15/M-A13), transcript re-record protocol
> (D15/M-A13), in-repo hybrid drift-check (D2).** Byte-equal cross-language golden encode is DROPPED (no
> canonicalizer to invent, feasibility-1); the guarantee is decode → re-encode → re-decode to an
> equal-after-normalization value on both sides, plus a **union-exhaustiveness** test. The Swift
> conformance job is **required on PRs** touching `packages/extensions/ios` or the Swift source tree (not
> best-effort). Recorded `simctl`/Xcode transcripts carry the Xcode version they came from and are
> re-recorded on Xcode major bumps.

Aligned to the repo's hard testing rules (`AGENTS.md`, memory): real browser only (no jsdom), widget ITs
load the prebuilt bundle, Playwright `newPage()` not `newContext()`, never wait for `networkidle` on a
live widget, no test-ids/CSS-impl-detail assertions, no stubs/mocks of _our own_ code, Solid vitest
configs pin `environment:'node'`. New test packages must wire `ciReporters()`.

## 1. Grab contract (Phase 0) — browser tests, existing harness

Phase 0 is exercised by the existing `@conciv/page` browser tests plus a new render test:

- Update `packages/page/test/capture-element.browser.test.ts` for `preview` (was `snapshot.node`).
- Add a browser test for `apps/conciv/src/chat/grab-reference.tsx` rendering **both** preview arms: a
  `dom` grab (from the testkit fake) and an `image` grab (from a fixture data-URL). Assert the DOM arm
  appends the cloned node and the image arm renders an `<img>` — via native assertions (visible content),
  not CSS internals.
- `packages/extension-testkit/src/host/grab.ts` continues to produce a valid `Grab`; add
  `makeImageHostGrab(dataUrl)` here (a testkit helper, not a mock of product code — it is the same fake
  host the testkit already ships) so browser tests can drive the native path without a simulator.

## 2. iOS extension tools — the simctl boundary problem (decide honestly)

The repo forbids stubbing **our own** code, but `ios.build/run/screenshot/logs` are thin wrappers over
**external CLIs** (`xcodebuild`, `xcrun simctl`). Those need a boundary or every test needs a live Xcode +
booted simulator, which is not hermetic and cannot run in the current CI.

Options considered:

- **(A) Hermetic fake CLI adapter behind a seam.** Define a narrow `SimctlRunner`/`XcodeRunner` interface
  (`{run(args): Promise<{code, stdout, stderr}>}`) that the tools depend on; production wires it to
  `execFile`, tests wire a fake. This _is_ a seam over external tools, not a mock of our logic — the tool's
  parsing/mapping logic (diagnostics extraction, env assembly, output shaping) is what we test, and it is
  ours. This is legitimate under the rules (the boundary is a third-party process, exactly like the
  harness/runner registry/stub pattern `AGENTS.md` already blesses: "Test runners follow the same
  registry/stub pattern").
- **(B) Record/replay real `simctl` transcripts.** Capture real `simctl`/`xcodebuild` invocations +
  outputs once (on a machine with Xcode), store as fixtures, and replay them through the seam. Higher
  fidelity for the parsing logic (real diagnostic text, real `simctl list` JSON) with no live sim.

**Recommendation: (A) as the mechanism, seeded by (B)'s fixtures.** Implement the `SimctlRunner` seam
(justified by the existing runner-stub precedent). Feed the fake with **recorded real transcripts** for
the cases where output parsing matters (a real `xcodebuild` error block → `diagnostics`; a real
`simctl list -j` → udid resolution; a real screenshot byte stream → data-URL). This tests our parsing
against real-world output without a simulator and stays hermetic. Pure-logic bits (env assembly,
`SIMCTL_CHILD_*` prefixing, argument construction) are asserted directly on the argument vectors the seam
receives. Keep the seam interface minimal so it does not become a place to fake behavior we should test
for real.

A separate, non-CI **live smoke** (opt-in, `describe.skipIf(!process.env.CONCIV_IOS_LIVE)`) actually runs
`ios.build`/`ios.run` against a booted sim for the manual verification protocol (below).

## 3. iOS extension client — widget integration test (real browser)

The client half (native `GrabApi`, `window.__concivNative`, handshake, open signal) runs in a browser and
is tested as a widget IT:

- Load the **prebuilt** widget bundle (`packages/embed/dist/conciv-widget.global.js`) — rebuild it
  (`pnpm turbo run build --filter=@conciv/embed`) before running or you test stale code (repo rule).
- Use `browser.newPage()` (not `newContext()`).
- Stand in for native: the test page defines `window.webkit.messageHandlers.concivBridge.postMessage` to
  capture Page→Native messages, and calls `window.__concivNative.*` to simulate Native→Page. This is a
  test double of the **platform**, not of our code — allowed.
- Mount the widget via the **native-entry** path with `grabProvider: makeNativeGrabProvider()` (the single
  host seam, D1) so the composer grab button drives the native provider — the real integration path, not an
  extension-value merge and not a window-global registration (deleted, D1).
- Assert: a grab affordance click posts `grab.pick` with a `requestId`; a simulated `grabResult` (matching
  `requestId`) with an image grab resolves the pick, the staged preview renders, **and the folded subtree is
  present in `grab.text`** (D6); a **superseded/late** `grabResult` (wrong `requestId`) is ignored (M8);
  Native→Page calls sent before `bridge.ready` are queued then flushed; `bridge.ready` re-posts until the
  first acked call (M-A4/D4); `handshake` is retried until acked (M-A5/D4); native `open`/`close` are
  set-state so a double `open` is idempotent (D4); native `open` opens the panel with a single call
  (validates `05` §2); the initial base is the served page's own origin (D1), and a `handshake` with a new
  base for the **same core** drives `handle.rebind` re-pointing RPC to a second mock core with nav/session
  preserved (validates D8/`05` §2b); `bridge.incompatible` surfaces a visible widget error (D3).
- Never wait for `networkidle` (SSE never idles); wait for `domcontentloaded` or a UI signal.

## 4. Bridge conformance — decode-equivalence + roundtrip, hand-maintained fixtures (D3, rewritten)

Byte-equal cross-language golden encode is **dropped** (no canonical stringify exists across
`JSON.stringify` / Swift `JSONEncoder`; AC was un-passable — feasibility-1). An arbitrary-zod-schema-walking
generator is **dropped** (unspecified, gate-blocking engineering — feasibility-2). The suite enforces the
rewritten `02` M11 strategy:

- **Hand-maintained fixture table.** `packages/extensions/ios/fixtures/bridge/` is authored as data — one
  valid, one invalid (missing/mistyped required field), and one unknown-key case **per message variant** —
  not synthesized by walking schemas.
- **Union-exhaustiveness test (vitest).** Iterate the `BridgeMessage` discriminated union's `type` literals
  and **fail if any variant lacks valid + invalid + unknown-key entries.** This is the mechanical guarantee
  that the table can never silently miss a variant.
- **Runtime is non-strict; strict only in tests.** Runtime receivers ignore unknown keys (additive
  evolution, D3). The strict variant is used only to prove `invalid/` cases are structurally wrong and to
  confirm unknown-key cases still **decode** (are ignored) at runtime.
- **Decode-equivalence + roundtrip.** TS: each valid/unknown-key file `.parse`s (non-strict); each
  `invalid/` fails the strict schema; a TS encode → decode roundtrip yields an equal-after-normalization
  value. Swift (`04`): `BridgeConformanceTests` decode each valid/unknown-key fixture (default Codable
  ignores unknown keys — no custom `init(from:)`), re-encode, and assert the re-encoded JSON re-decodes to
  an **equal value after normalization** (parse both to an in-memory value and compare — **not** byte-equal
  strings); each `invalid/` fixture must fail to decode.

A silent divergence surfaces as a decode/roundtrip mismatch, without asserting an impossible byte-equal
encode across three serializers.

## 5. Native SDK (Swift) — XCTest + in-repo fixtures drift-check (D2 / D3 / D15)

`swift test` (run from the **nested** `native/swift/ConcivWidget/Package.swift`, D2) runs:

- `BridgeConformanceTests` against the **committed fixture copy**
  (`native/swift/ConcivWidget/Tests/ConcivWidgetTests/Fixtures/bridge/`), which the gen command keeps in
  sync with the canonical dir; the CI `git diff --exit-code` after `pnpm --filter @conciv/extension-ios
gen:fixtures` is the **in-repo drift gate** — the sync is a wired command, not left to the implementer,
  and both trees live in one repo so a bridge change and its fixture sync land in the same PR (D2 hybrid).
- `PickSelectionTests` (D5) — **UIKit** hit-test selection against a synthetic view tree **and a real
  SwiftUI screen using `.concivGrab(id:)`**: a picked anchored row returns the anchor `id`, its label text,
  and the crop-to-anchor frame; unanchored SwiftUI content is **not** asserted (out of v1). No
  accessibility-tree traversal is tested.
- `NeutralGrab` assembly, including the subtree folded into `grab.text` (D6). UI-level overlay/pass-through
  and keyboard/safe-area behavior stay in the manual protocol for v1.

### Transcript rot — re-record protocol (D15 / M-A13)

Recorded `simctl`/`xcodebuild` transcripts (§2) and any Swift snapshot outputs are Xcode-version-specific
and rot green (they keep passing against stale expectations). Protocol:

- A recorded transcript carries the **Xcode version it was recorded from** (`transcript-xcode-version.txt`,
  or a header in each transcript). The tests assert that version is within a **supported matrix**.
- On an **Xcode major bump**, transcripts are **re-recorded** (a documented step), and the supported matrix
  is updated. A transcript from an unsupported Xcode version fails the test loudly rather than passing
  vacuously.

## 6. CI lane decision — DEFER the sim lane, but the Swift conformance job is REQUIRED (D15)

**Recommendation: no macOS/simulator e2e CI lane in the first shipping increment** (slow, flaky — the
memory documents `simctl`/`lsof` lies on GH runners — expensive). What CI covers:

- Phase 0, widget-side, extension client, and bridge-fixture (TS) tests run in the normal browser/node CI.
- The `ios.*` tool logic runs hermetically via the `SimctlRunner` seam + recorded transcripts — full
  coverage of parsing/env logic, no simulator.
- **The Swift bridge conformance job is REQUIRED, not best-effort (D15/M-A13).** A `macos` job (build +
  `swift test` from the nested manifest — cheap, no simulator, just compile + decode/roundtrip fixtures) is
  **required on PRs that touch `packages/extensions/ios` (the bridge schema/fixtures) or
  `native/swift/ConcivWidget/`**. The earlier plan made it "separate, optional," which left the
  cross-language contract guaranteed TS-side and best-effort Swift-side (the M-A13 asymmetry). Making it a
  required, path-filtered gate removes that asymmetry without paying for a simulator on every PR. Full
  simulator e2e stays manual until the extension stabilizes, then revisit a nightly (not per-PR) sim lane.

## 7. Manual verification protocol (the v1 gate)

Until a sim CI lane exists, this written protocol is the acceptance gate for the native path. Run on a Mac
with Xcode:

1. `pnpm turbo run build --filter=@conciv/embed` (fresh bundle).
2. Start the dev core on the pinned port for a native project (or the spike demo app in `swiftc` mode).
3. From the agent panel, run `ios.build` then `ios.run`; confirm no bash approval prompts, the app boots
   in the sim, the transparent overlay + FAB appear over the native screen.
4. Tap a native control with the panel closed → it responds (hitTest passthrough).
5. Tap the FAB → panel opens (single open, no flicker/retry). Tap grab → pick a native view →
   staged image preview + text + class appear in the composer.
6. Ask the agent about the grabbed view → it uses the subtree folded into `grab.text` (D6) + `source` +
   grep to locate the Swift and can act; run `ios.screenshot` (returns an `imageResult` image) to verify a
   change after `ios.build`/`ios.run`. (There is no `ios.viewHierarchy` tool in v1, B4.)
7. Restart the **same** core on a new port → confirm re-handshake re-binds without relaunching the app,
   nav/session preserved (same-core drift, D8). Point the SDK at a **different** core → confirm it fresh-
   mounts (no stale nav/session). Kill the WebView content process → confirm reload → fresh handshake, no
   blank overlay (D4).
8. On a real device: type in the composer → keyboard raises without covering it; safe-area insets correct
   (D12).

Capture screenshots at each step as the evidence bundle (the spike stored `last-pick.jpg`/`.json`; keep
that debug-evidence habit behind an env flag, never in shipped source per `no-debug-flags-in-source`).

## Acceptance criteria

- **AC1** — All TS tests (Phase 0 render, extension client IT, bridge fixtures, tool logic via seam) pass
  in the normal CI with no simulator.
- **AC2** — `SimctlRunner` seam is a thin external-process boundary; no test fakes our parsing/mapping
  logic — that logic runs against recorded real transcripts.
- **AC3** — The macOS `swift test` conformance job is **required** on PRs touching
  `packages/extensions/ios` or `native/swift/ConcivWidget/` (decode + roundtrip, D3/D15); no per-PR
  simulator job is added. Transcripts carry their Xcode version and are re-recorded on major bumps (D15).
- **AC4** — The manual protocol is documented in the extension README and produces a screenshot evidence
  bundle on a clean run.
