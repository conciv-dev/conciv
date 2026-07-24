# 03 — `packages/extensions/ios` (the extension)

> **Review fixes (review-01-codex): B1, B3, B4, M8, M10.** The client half no longer claims to "merge a
> native `GrabApi` into host wiring" (impossible — `.client()` only returns `value`); the native grab is a
> **host-level `grabProvider`** passed into `createConciv` by the native embed entry (B1). Delivery is a
> **native embed entry + plugin `clientEntries`**, not the plain global bundle (B3). `ios.viewHierarchy`
> is **removed** (B4); `ios.screenshot` returns `imageResult()` (M10); grab concurrency mirrors the web
> `pendingResolve` (M8).
>
> **Review fixes (review-02/03/04): core-served native page is sole delivery (D1), native-entry src path
> (feasibility-6), grab seam single-source / window seam DELETED (D1/M-A7/feasibility-3), optional inert
> config (D7/codex-new-B1), subtree-in-text (D6/codex-new-B2), grabbable threading (D9/codex-major),
> singleton pick (D10/M-A6), embed deps wiring (D16/codex-major), SwiftUI anchors (D5, see `04`).** The
> native page is **served by the core** and loaded by the SDK WebView; there is no SDK-bundled host HTML in
> v1. The native entry lives at a real production path (`packages/embed/src/native-entry.ts` +
> `vite.native.config.ts`), NOT under `test/fixtures`. `window.__CONCIV_GRAB_PROVIDER__` is **deleted** —
> `init.grabProvider` is the only grab seam. The iOS server config is **fully optional and inert when
> absent**. The subtree reaches the model through **`grab.text`** (D6). `grabbable` is threaded through
> `GrabApi` end to end (D9). `@conciv/embed` gains `@conciv/extension-ios` as a workspace dependency and a
> native build + build-test (D16).

The conciv-side extension. Two halves, like terminal:

- **Server** (`server.ts`) — the `ios.*` tools the agent sees, executing `xcodebuild`/`simctl` server-side.
- **Client** (`client.tsx`) — installs `window.__concivNative`, drives the shared bridge-client state
  machine (`src/shared/bridge-client.ts`, D11/`02`), and **exports** a `makeNativeGrabProvider()` factory
  that the **core-served native page entry** passes into `createConciv` (the client does **not** install
  grab into host wiring by itself, see "Client half" below). Runs inside the `WKWebView`.

Package name `@conciv/extension-ios`, directory `packages/extensions/ios` (mirrors
`@conciv/extension-terminal` at `packages/extensions/terminal`). Follow that package.json verbatim
(see `08` for the publish fields).

## Delivery: the CORE serves the native page (sole v1 model — D1)

The plain global bundle (`packages/embed/dist/conciv-widget.global.js`) is built from a fixed fixture entry
that statically imports only terminal + recorder and calls `mountConciv([...])`
(`packages/embed/test/fixtures/global-entry.ts`); it has **no runtime extension loading**, so the ios
client cannot appear in it. The **sole v1 delivery** is a native page **built from `@conciv/embed` and
served by the core**, which the SDK WebView loads by URL. Two concrete pieces:

1. **A real production native entry in `@conciv/embed`.** Add `packages/embed/src/native-entry.ts` (a real
   `src/` file — NOT under `test/fixtures`, feasibility-6) built by a sibling `vite.native.config.ts`
   (mirroring `vite.global.config.ts`). The entry is a small native bootstrap:

   ```ts
   import iosClient, {makeNativeGrabProvider} from '@conciv/extension-ios/client'
   import {createConciv} from './mount.js'
   const root = document.querySelector<HTMLElement>('[data-conciv-native-root]') ?? document.body
   const handle = createConciv({
     extensions: [iosClient],
     settings: {launcher: 'native'}, // SDK default (D17); native FAB owns open/close
     apiBase: window.location.origin, // page is core-served ⇒ same-origin (D1)
     grabProvider: makeNativeGrabProvider(), // the ONLY grab seam (window seam deleted, D1)
   })
   window.__concivRebind = handle.rebind // wired to the bridge handshake (02/05)
   void handle.mount(root)
   ```

   It is the same `@conciv/embed` app code — no fork — with a different entry and a transparent host
   document (`html,body{background:transparent}`, appendix A.5). `@conciv/embed` must add
   `@conciv/extension-ios` to its `dependencies` (workspace protocol `"@conciv/extension-ios":
"workspace:^"`, matching every other `@conciv/*` dep in embed's manifest — verified), and the native
   build joins embed's `build` script and `files` (D16, `08`). A **build test mirrors
   `mount-externals.test.ts`**: it reads the native bundle from `dist/` and asserts the ios client is
   present (inlined) and the shared Solid/Ark runtime is externalized (so the WebView shares one Ark/Solid
   context, per the widget-externalize rule).

2. **How the core serves it.** Core routing today (`packages/core/src/app.ts` `composeRoutes`) serves
   `/health`, `/rpc/*`, `/api/mcp`, and extension routes — it does **not** currently serve an HTML page; in
   dev the widget page is served by the `@conciv/it` **build** plugin (a Vite/unplugin, `packages/it/src/
plugin-instance.ts` → `plugin/vite.ts`), not by core. So "core serves the native page" is a **small new
   core route** that returns the built native HTML + `native-entry` bundle from `@conciv/embed/dist`
   (analogous to how a Vite host serves the widget), added alongside `composeRoutes`. Register the ios
   server + client in `packages/it/src/plugin-instance.ts` (`serverExtensions` gets `iosServer`;
   `clientEntries` gets `@conciv/extension-ios/client`) so the `ios.*` tools are known to the core and the
   client is compiled into the served bundle, exactly as terminal/test-runner/whiteboard are wired there
   (note: that file lists terminal/test-runner/whiteboard, not recorder — match the real list).

   > **Flag (verify at implementation): core does not serve HTML today.** The orchestrator directive said
   > "follow how the core/it plugin serves pages today." The honest finding is that **core serves no HTML
   > route** — the `it` plugin is a bundler plugin, and pages are served by a Vite host in dev. The
   > closest honest mechanism is a **new core route** that serves the `@conciv/embed` native build output.
   > This is genuinely new (small) server work, called out rather than pretended to be existing.

The server tools run in the core regardless; only the grab/bridge client half depends on the served page.

## Why first-class tools, not raw bash (the load-bearing decision)

The spike drove the edit loop by having a widget-embedded agent run `./relaunch.sh` through Bash. That
works but is wrong long-term:

- **Approval friction.** `classifyCommand` (`packages/core/src/chat/gate.ts:44-53`) returns `allow` only
  for a fixed read-only set (`git` read subcommands, `conciv tools`, a `READ_ONLY` allowlist) and for
  commands with no shell metacharacters. `xcodebuild`, `xcrun simctl ...`, and `./relaunch.sh` are none
  of those → every invocation classifies as `ask` and prompts the user. A build/run loop would prompt
  constantly.
- **No validation, no structure.** Bash strings are opaque; the agent can pass anything, and output is
  unstructured text.

Extension tools avoid all of this. `buildExtensionTools` (`packages/core/src/app.ts:101-113`) turns each
`defineTool(...).server(fn)` into an agent tool whose `execute` runs **inside the extension server
process**, entirely bypassing the bash gate. Inputs are zod-parsed (`define-tool.ts:32`), outputs are
structured, and a co-located `.render(Card)` shows build status in the panel. Selective per-tool approval
is available via `approval: 'ask'` (`define-tool.ts:20`) for the mutating tools only.

**Decision: `ios.*` are first-class extension tools. No raw bash in the loop.**

## Server tools

All wrap `xcrun`/`xcodebuild`/`simctl` via `node:child_process` (`execFile`, never a shell string — no
injection surface). `DEVELOPER_DIR` defaults to `/Applications/Xcode.app/Contents/Developer` and is
overridable via config (spike `build.sh` line 8). Note `simctl` was absent from this plan's authoring
machine PATH but present under `xcrun` — **always invoke as `xcrun simctl ...`**, never bare `simctl`.

Server context (`ServerApi`, `packages/extension/src/types.ts:72`) gives `cwd`, `stateDir`, `sessions`,
`harness`. The ios server also holds config: project root, scheme, bundle id, simulator udid/name.

### Config schema (`configSchema` on `defineExtension`) — fully optional + inert when absent (D7)

The ios server extension registers **unconditionally** in `plugin-instance.ts` (harmless to have in every
`@conciv/it` project). But core parses **every** registered extension's config at startup —
`config: extension.parseConfig(opts.extensionConfig?.[extension.name])` (`packages/core/src/app.ts:198`,
the review's "app.ts:193" parse path) — and `parseConfig(undefined)` runs the schema against `{}`. If the
schema had required `projectRoot`/`bundleId`, **every ordinary project without an `ios` config would fail
to start** (codex-new-B1). So the entire config is optional:

```ts
const IosConfigSchema = z
  .object({
    projectRoot: z.string().min(1), // native project dir (absolute or cwd-relative)
    scheme: z.string().min(1).optional(), // xcodebuild scheme; or spike-style swiftc for demos
    bundleId: z.string().min(1), // e.g. dev.conciv.spike2
    simulator: z.string().default('iPhone 17 Pro'), // name or udid; resolved via `simctl list`
    developerDir: z.string().optional(), // DEVELOPER_DIR override
    buildMode: z.enum(['xcodebuild', 'swiftc']).default('xcodebuild'),
  })
  .optional() // absent config ⇒ inert, not a startup failure
```

`parseConfig(undefined)` therefore yields `undefined`, the server mounts **inert**, and every `ios.*` tool
returns a clear `{ok: false, error: 'ios extension not configured'}` result (never throws, never prompts)
when the config is absent. Registration stays unconditional and harmless; only a project that actually sets
`extensions.ios` gets a live build/run loop.

`buildMode: 'swiftc'` reproduces the spike's fast no-xcodeproj path (appendix `build.sh`) for demo apps;
`'xcodebuild'` is the real-project path. Both are covered by `ios.build`.

### Tool inventory

| tool                     | approval         | input (zod sketch)                                            | output                                                                                                       | wraps                                                                                                |
| ------------------------ | ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `ios.build`              | `ask`            | `{clean?: boolean}`                                           | `{ok: boolean, appPath: string \| null, durationMs: number, diagnostics: {file, line, message, severity}[]}` | `xcodebuild build` (or `swiftc` per `buildMode`); parse diagnostics                                  |
| `ios.run`                | `ask`            | `{autoshow?: boolean}`                                        | `{ok: boolean, udid: string, bundleId: string, pid?: number}`                                                | `simctl boot` (idempotent) → `install` → `terminate` (tolerant) → `launch` with `SIMCTL_CHILD_*` env |
| `ios.screenshot`         | none (read-only) | `{}`                                                          | **`imageResult('image/png', base64, {width, height})`** — image content part + JSON detail (M10)             | `simctl io <udid> screenshot -` → PNG bytes → base64                                                 |
| `ios.logs`               | none             | `{sinceSeconds?: number, predicate?: string, limit?: number}` | `{ok: boolean, lines: string[]}`                                                                             | `simctl spawn <udid> log show --last <n>s` (or `log stream` bounded)                                 |
| `ios.inject` **(later)** | `ask`            | `{symbol?: string}`                                           | `{ok, method}`                                                                                               | dyld `-interposable` hot swap; parked until M4 stabilizes                                            |

**`ios.screenshot` returns `imageResult()` (M10).** The repo already ships
`imageResult(mimeType, dataBase64, detail?)` (`packages/extension/src/image-result.ts:11`) to return an
image content part to the model plus a structured text detail; returning a full-screen PNG as a JSON
`dataUrl` string inflates tool text, risks context limits, and may not be read as an image. So
`ios.screenshot` returns `imageResult('image/png', base64, {width, height})` — the image part carries the
pixels, the JSON detail carries dimensions.

**`ios.viewHierarchy` is removed from v1 (B4).** `xcrun simctl ui <udid>` controls UI _preferences_
(appearance, content size), not an application view/accessibility tree — there is no `simctl` command that
dumps the hierarchy, so the "fallback that unblocks M3" does not exist. And an agent-pulled hierarchy would
need a server→WebView→native request/response path, which the extension tool runtime does not provide (the
only out-of-band channel is `conciv_ui`/`uiReply`, agent-tool-call driven — see `02` B4 and `10` Q3). v1's
"what is on screen" is delivered by `ios.screenshot` (visual) plus the **grab-attached view subtree** (a
bounded `ViewNode` tree captured by the SDK at pick time and carried on `NeutralGrab.subtree`, `02`), which
flows client→server over the existing grab path and needs no new channel. The deferred agent-pulled
hierarchy design (out-of-band request table or an XCUITest accessibility snapshot) is in `10` Q3.

`ViewNode` = `{class: string, a11yId: string | null, text: string | null, rect: ElementRect,
children: ViewNode[]}`. **UIKit** subtrees come from the spike-proven `UIView` hit-test walk; **SwiftUI**
subtrees come from **SDK-owned anchor modifiers** (`.concivGrab(id:)`, `04` §3 / D5) that register geometry
in an in-process registry — there is **no general accessibility-tree traversal** (SwiftUI does not expose a
publicly-enumerable in-process semantic tree, codex-9/B-A3). Unanchored SwiftUI content is **not pickable
in v1** (documented honestly, `04` AC3).

### `ios.run` env handoff (spike gotcha, appendix)

`simctl launch --setenv` **does not exist.** Pass child env via `SIMCTL_CHILD_<VAR>=...` prefixes on the
`simctl launch` invocation itself (spike `run.sh`/`relaunch.sh`). `ios.run` sets
`SIMCTL_CHILD_CONCIV_URL` (the core apiBase the WebView should load) and any autoshow flag this way.

### Streaming / long-running builds

`ios.build` can take seconds. Use the tool's `streamTitle` (`define-tool.ts` / `ExtensionTool.streamTitle`)
so the panel shows a live "Building…" card, and return the structured result when the child exits. Do
**not** hand-roll a poll loop; if incremental progress is needed, emit via the same subscription pattern
terminal uses (`subscriptionIterator`, `server.ts`), but for v1 a single awaited result is enough.

## Source context (fixes "not in this repo")

The spike payload had `filePath: ""`, so the agent could not locate the tapped view in the codebase. The
honest options, worst→best, and the v1 recommendation:

- **v0 (registered root only):** the extension config carries `projectRoot` + `scheme`. The grab payload
  sets `source.filePath = ""` but the **system prompt** (below) tells the agent the native project root
  and that view classes map to `.swift` files by grep. The agent does `class="PaymentCardCell"` →
  `grep -rn "class PaymentCardCell" <projectRoot>`. Crude but it unblocks action. **This is v1.**
- **v1.5 (a11y-id convention):** document a convention — developers set
  `view.accessibilityIdentifier = "PaymentsScreen/payrollRow"`. The SDK includes it in the payload
  (`source.componentName` or a dedicated field); the agent greps for the id string. Opt-in, zero build
  tooling, high value. Recommend shipping the convention doc alongside v1.
- **v2 (build-time index):** a SourceKit/`indexstore` pass maps symbols→files→lines at build time; the
  extension resolves `class`/a11y-id → exact `file:line` and fills `source` fully. Real but heavy; a
  future milestone. Tracked in `10`.

The `source.filePath`/`lineNumber` fields already exist in the Phase 0 contract, so any of these can
populate them without another contract change.

## Client half (`client.tsx`) — and why grab is a host seam, not extension wiring (B1)

**The impossible plan, corrected.** An extension `.client(() => ({value: {...}}))` factory returns only an
extension-local `value` (`packages/extension/src/define-extension.ts:64,117`), surfaced to the extension's
own `Component`/`Surface` under the `value` key (`packages/extension/src/mount-extension.tsx:12,31`). It
**cannot** replace the host's `grab`. The host `grab` context is constructed by `makePaneGrabApi`
(`apps/conciv/src/extension/pane-grab.ts:5`) — which hardwires the web `@conciv/page` adapter — and provided
at `HostApiProvider grab={paneGrab}` (`apps/conciv/src/chat/chat-pane.tsx:375`,
`apps/conciv/src/routes/panel.$sessionId.$view.tsx:55`). So the main composer's grab button always drives
`react-grab`; no extension client can intercept it. The seam must be at the **host** level.

**The host-level `grabProvider` seam — `init.grabProvider` is the ONLY seam (D1/M-A7).** Design (types +
touched files in `05`):

- `@conciv/grab`'s `GrabApi` itself gains optional `grabbable?: () => boolean` (D9/`01`), and a neutral
  `GrabProvider` type — a factory of the pick side of the API:
  `type GrabActions = Pick<GrabApi, 'pick' | 'comment' | 'cancel' | 'isActive' | 'grabbable'>`;
  `type GrabProvider = () => GrabActions`. It references **no** DOM type (Phase 0 discipline), so a native
  provider is constructible.
- `ConcivInit` (`packages/embed/src/mount.ts:8`) gains `grabProvider?: GrabProvider`. `boot()` passes it
  through `createConcivRouter` into `ConcivRouterContext` (`apps/conciv/src/router.ts:14`).
- `makePaneGrabApi(store, provider?)` uses `provider()`'s `pick/comment/cancel/isActive/grabbable` when a
  provider is present, else the web `pageGrabApi`; `stage/staged/clear` stay store-backed either way.
  `grabbable` is returned on the resulting `GrabApi` so it survives to the composer (D9, `05` §0/§4).

The **core-served native page entry** passes `grabProvider: makeNativeGrabProvider()` into `createConciv`.
**The `window.__CONCIV_GRAB_PROVIDER__` import-time self-registration seam is DELETED (D1/M-A7/feasibility-3)**:
because the native page is core-served and built from `native-entry.ts` (which calls `createConciv` with the
provider), there is no second `mountConciv`-with-no-init delivery that needed a window seam. One seam, no
import-order race, no `sideEffects`/tree-shaking contract to pin. On web with no `grabProvider`, behavior is
byte-for-byte unchanged (default `pageGrabApi`).

Client `client.tsx` responsibilities (WebView):

1. **Install `window.__concivNative`** (the Native→Page methods from `02`): `handshake`,
   `bridge.incompatible`, `open` (ensure-open), `close` (ensure-closed), `grabResult`, `grabCapability`.
   Each dispatch posts `bridge.ack {seq}`. `grabResult` resolves the pending `pick()` only when `requestId`
   matches (M8, `02`). All of this drives the shared `src/shared/bridge-client.ts` machine (D11).
2. **Export `makeNativeGrabProvider()`** — the `GrabProvider` the host uses (a **singleton** over the one
   native transport, M-A6/D10: a new pick from any pane supersedes the prior globally). `pick(mode)` posts
   `grab.pick` with a fresh `requestId` (first resolving any prior pending pick with `null`, mirroring
   `packages/page/src/grab-api.ts:18`) and returns a promise resolved by the matching `grabResult`; `cancel`
   posts `grab.cancel`; `isActive` tracks the pending request; `grabbable()` reflects the last
   `grabCapability`. It produces `preview.kind === 'image'` grabs and **serializes the bounded subtree into
   `grab.text`** (D6, `02`) so the structure reaches the model through the existing `grab.text` send path.
3. **Readiness + version negotiation** — on install, post `bridge.ready` (re-posted until the first acked
   N→P call, D4), then `handshake.hello {minV, maxV, clientId, bundleReady: true}`. The initial base is the
   served page's own origin (D1); use the `handshake` reply only to `handle.rebind` when the base changed
   (same-core port drift, D8). On `bridge.incompatible`, surface a visible widget error (D3).
4. **Open/close bridge** — on native `open`/`close` (set-state, D4), drive the widget ensure-open/
   ensure-closed signal (`05`). On the widget's own `conciv:panel-toggled`, post `host.panelToggled`
   (including `mascotRect` when `launcher: 'mascot'`, D17) so native can resize its touch region.
5. **Grab capability** — on `grabCapability`, update the value `grabbable()` returns (`05`).

The renderer from Phase 0 already handles the image arm. **No widget code special-cases iOS** — the host
seam takes a provider, the widget renders generically (`no-central-catalog-self-describe`).

### System prompt

`systemPrompt` on the extension tells the agent: the ios tools exist and what each does; the native
project root and scheme; the "grep view class → .swift" source convention; that after editing Swift it
must `ios.build` then `ios.run` then `ios.screenshot` to verify (there is no `ios.viewHierarchy`; a grab's
folded-into-`grab.text` subtree + `source` carry structure); the `.concivGrab(id:)` anchor convention for
SwiftUI grabbability (D5); and that unanchored SwiftUI content is not pickable. No em dashes in the string
(repo rule). Keep it a dumb, factual adapter over the tools (`thin-llm-layer-over-tested-code`).

## Acceptance criteria

- **AC1** — `ios.build` on the spike demo app (swiftc mode) returns `{ok:true, appPath}` and parses a
  deliberately-introduced Swift error into `diagnostics` with correct `file`/`line`.
- **AC2** — `ios.run` boots/installs/launches on a booted sim and the app appears; re-running is
  idempotent (terminate-tolerant). Env reaches the app via `SIMCTL_CHILD_*` (assert the launched app
  reads `CONCIV_URL`).
- **AC3** — `ios.screenshot` returns an `imageResult('image/png', ...)` (image content part + `{width,
height}` detail) of the current sim screen; `ios.logs` returns recent lines. No `ios.viewHierarchy` tool
  exists; screen structure reaches the agent via the subtree folded into `grab.text` (D6, `02`) instead.
- **AC3b (D7)** — With **no** `ios` config, core still starts (`parseConfig(undefined)` → inert server), and
  every `ios.*` tool returns a clear "ios extension not configured" result rather than throwing.
- **AC4** — Every tool call runs **without a bash approval prompt** (they are extension tools, not Bash).
  Mutating tools (`build`/`run`) request approval via `approval: 'ask'` only.
- **AC5** — Host seam: with `grabProvider: makeNativeGrabProvider()` passed to `createConciv` (the only
  seam — no window global, D1), the composer grab button drives the native provider (not `react-grab`), and
  `grab.grabbable` reaches the composer (D9); a simulated `grabResult` with an image-preview grab resolves
  the pending `pick()`, the staged preview renders, and the subtree is present in `grab.text` (browser test,
  `07`). Without a provider, web grab is unchanged.
- **AC6** — `fallow audit` introduces nothing; typecheck/build/test green.
