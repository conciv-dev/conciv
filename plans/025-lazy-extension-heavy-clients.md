# Plan 025: Excalidraw and xterm code-split out of the widget boot bundle, loaded only when their view first renders

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/extensions/whiteboard/src/client.tsx packages/extensions/terminal/src/client.tsx packages/extension/src/define-extension.ts`
> If any changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

The conciv widget is injected into the user's running dev app on every boot. Two heavyweight libraries — **Excalidraw** (a React-based canvas lib, pulling in a React bridge) via the whiteboard extension, and **xterm** via the terminal extension — are statically imported into the widget entry, so every boot downloads, parses, and evaluates them even for the many sessions where the user never opens the whiteboard or terminal. These are the heaviest weights in the injected bundle. The extension architecture renders a view's `Component` only when its surface is opened, so deferring the heavy component behind a lazy import removes that cost from boot for anyone who doesn't use the surface. This plan converts each extension's view `Component` to a Solid `lazy()` boundary, code-splitting Excalidraw/xterm into chunks fetched on first render of their view.

## Current state

- `packages/it/src/plugin-instance.ts:9-13` — the built-in client entries statically wired into the widget:

```ts
clientEntries: [
  fileURLToPath(import.meta.resolve('@conciv/extension-terminal/client')),
  fileURLToPath(import.meta.resolve('@conciv/extension-test-runner/client')),
  fileURLToPath(import.meta.resolve('@conciv/extension-whiteboard/client')),
],
```

- `packages/extension-compiler/src/extensions.ts:24` — the generated widget entry `import`s each client entry statically: `import builtin${index} from ${JSON.stringify(entry)}`, then `mountConciv([...])`. The extension **descriptors** (tools, view metadata) must be available synchronously for registration — so the split must happen at the view `Component`, not the whole client entry.

- `packages/extensions/terminal/src/client.tsx` — the terminal client registers a view with a static `Component`:

```ts
import {TerminalPanelView} from './client/terminal-panel-view.js'
export const terminal = defineExtension({
  name: TERMINAL_NAME,
  views: [
    {id: 'terminal', label: 'Terminal', icon: SquareTerminal, Component: TerminalPanelView, actions: TerminalActions},
  ],
}).client(() => ({value: {store: createTerminalStore()}}))
```

`TerminalPanelView` → `@conciv/ui-kit-terminal` → `packages/ui-kit-terminal/src/model.ts:2-3` statically `import {Terminal as Xterm} from '@xterm/xterm'` + `@xterm/addon-fit`.

- `packages/extensions/whiteboard/src/client.tsx` — registers a `Surface` view whose component chain reaches Excalidraw: `Surface` → `WhiteboardSurface` (`./client/overlay.js`) → `canvas/island.tsx:5` `import {Excalidraw, ...} from '@excalidraw/excalidraw'`.

- `packages/extension/src/define-extension.ts:23,44,91` — `ExtensionView` has a `Component` field (a Solid component). A Solid `lazy(() => import(...))` returns a `Component`, so it satisfies this type without a contract change.

Key nuance to verify (Step 1): the terminal activity rail was recently made "open by default". If the terminal view renders on boot, lazy-loading xterm won't defer it for the terminal (it would load immediately anyway) — but the whiteboard/Excalidraw win is unconditional (the whiteboard only renders when toggled). Confirm the terminal's boot behavior before assuming its win.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`. oxfmt style.
- Solid `lazy()` from `solid-js`; heavy view components render inside a `<Suspense>` boundary — check whether the host slot/panel that renders `view.Component` already wraps it in `<Suspense>` (grep `packages/extension/src/catalog.ts` and the embed/app view host). If not, the lazy component needs a `<Suspense fallback={...}>` wrapper at its use site or inside the view Component file.
- Widget changes require **rebuild + hard reload** to observe (editing src alone runs stale bundle): `pnpm turbo run build --filter=@conciv/embed`.

## Commands you will need

| Purpose              | Command                                                                                              | Expected on success    |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------- |
| Typecheck whiteboard | `pnpm exec turbo run typecheck --filter=@conciv/extension-whiteboard`                                | exit 0                 |
| Typecheck terminal   | `pnpm exec turbo run typecheck --filter=@conciv/extension-terminal`                                  | exit 0                 |
| Build embed (bundle) | `pnpm exec turbo run build --filter=@conciv/embed`                                                   | exit 0, chunks emitted |
| Test                 | `pnpm exec turbo run test --filter=@conciv/extension-whiteboard --filter=@conciv/extension-terminal` | all pass               |
| Fallow               | `pnpm exec fallow audit --changed-since main --format json`                                          | no INTRODUCED findings |

## Scope

**In scope**:

- `packages/extensions/whiteboard/src/client.tsx` (wrap `Surface`/`WhiteboardSurface` in `lazy()`)
- `packages/extensions/terminal/src/client.tsx` (wrap `TerminalPanelView` in `lazy()`)
- Possibly a `<Suspense>` wrapper in each view's render path if the host doesn't provide one.

**Out of scope**:

- `packages/extension/src/define-extension.ts` and the `ExtensionView` contract — `lazy()` fits the existing `Component` type; do not change the contract.
- `packages/extension-compiler/src/extensions.ts` generated entry — the extension descriptors must stay synchronously importable; do NOT make the whole client entry a dynamic import (that would break tool/view registration).
- The heavy components' internals (`island.tsx`, `ui-kit-terminal/model.ts`) — do not refactor Excalidraw/xterm usage; only defer _when_ the component module loads.
- `test-runner` extension — no heavy lib; leave it.

## Git workflow

- Branch: `advisor/025-lazy-extension-heavy-clients`
- Commit style: `perf(extensions): lazy-load Excalidraw and xterm view components out of widget boot`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm which surfaces render on boot (baseline)

Build the embed bundle and inspect the chunk graph / boot behavior:

```
pnpm exec turbo run build --filter=@conciv/embed
```

- Check whether `@excalidraw` and `@xterm` currently appear in the main/boot chunk (they should — that's the finding). Note the boot chunk size.
- Determine if the terminal view renders on boot (grep the app/embed for where views mount, and whether the terminal rail is open-by-default). Record the finding: whiteboard = definite win; terminal = win only if not eagerly rendered.

**Verify**: you have recorded whether Excalidraw and xterm are in the boot chunk today, and whether the terminal renders on boot.

### Step 2: Lazy-load the whiteboard Surface component

In `packages/extensions/whiteboard/src/client.tsx`, replace the direct `Surface` view Component with a `lazy()` boundary that dynamically imports the module containing `WhiteboardSurface` (or a thin file that re-exports the current `Surface`). Target:

```ts
import {lazy} from 'solid-js'
const Surface = lazy(() => import('./client/surface-lazy.js').then((m) => ({default: m.Surface})))
```

Move the existing `Surface` function into a new module (e.g. `./client/surface-lazy.tsx`) that keeps its `whiteboard.useContext(...)` + `<WhiteboardSurface>` body, so that module (and its `@excalidraw` import chain) is only fetched when `lazy` resolves. Register the lazy `Surface` in the `defineExtension({views: [...]})` where it is used today.

If the host that renders view Components doesn't already wrap them in `<Suspense>`, add a `<Suspense fallback={null}>` inside the lazy wrapper's render or at the view's mount point so Solid can suspend during the dynamic import.

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/extension-whiteboard` → exit 0.

### Step 3: Lazy-load the terminal panel view

Same pattern in `packages/extensions/terminal/src/client.tsx`:

```ts
import {lazy} from 'solid-js'
const TerminalPanelView = lazy(() =>
  import('./client/terminal-panel-view.js').then((m) => ({default: m.TerminalPanelView})),
)
```

Keep `actions: TerminalActions` and the `.client(() => ...)` store as-is (they're light; only the panel view drags in xterm). If Step 1 showed the terminal renders on boot, note in the PR that this defers the import only marginally for terminal but still splits the chunk (helping the whiteboard-only user and enabling future gating).

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/extension-terminal` → exit 0.

### Step 4: Rebuild and confirm the split

```
pnpm exec turbo run build --filter=@conciv/embed
```

Confirm `@excalidraw` and `@xterm` now live in **separate chunks** not loaded by the boot entry (inspect the emitted chunk files / a build manifest, e.g. `grep -rl "excalidraw" packages/embed/dist` and check it's not the main entry chunk). Confirm the boot chunk size dropped versus Step 1's baseline.

**Verify**: Excalidraw/xterm are in async chunks; boot chunk is smaller than the Step 1 baseline.

### Step 5: Functional check + lint + fallow

- If a live dev environment is available (`pnpm dev`): open the app, confirm the widget boots without the whiteboard/terminal, then open the whiteboard — Excalidraw loads on demand and the canvas works; open the terminal — xterm loads and the terminal works. No regression in either surface.
- **Verify**:
  - `pnpm exec turbo run test --filter=@conciv/extension-whiteboard --filter=@conciv/extension-terminal` → all pass
  - `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- These extensions are tested via `@conciv/extension-testkit` (real browser, real server). The existing whiteboard/terminal tests mount the view — they exercise the lazy path (the view still renders, just after an async import). They must still pass.
- If an existing test asserts synchronous availability of the view component, it may need a `findBy*`/await instead of `getBy*` — adjust the test to await the lazy render, don't remove the assertion.
- Verification: the two extensions' test suites pass; the embed build shows the code split.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck test --filter=@conciv/extension-whiteboard --filter=@conciv/extension-terminal` exits 0
- [ ] `pnpm exec turbo run build --filter=@conciv/embed` emits Excalidraw and xterm in async chunks, not the boot entry chunk (verified by inspecting dist)
- [ ] Boot chunk size decreased versus the Step 1 baseline (record both numbers in the PR)
- [ ] Opening the whiteboard/terminal still works (functional check or passing testkit tests)
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The client entries don't match the "Current state" excerpts (drift).
- The host that renders view `Component`s doesn't support a suspending (lazy) component and adding `<Suspense>` requires changing the extension contract or the embed view host beyond a local wrapper — report; the whiteboard win may still be achievable via an internal lazy boundary inside `island.tsx` instead.
- After the split, Excalidraw/xterm still land in the boot chunk (a static import path survives elsewhere) — trace the remaining static import (`grep -rn "@excalidraw\|@xterm" packages --include=*.ts*`) and report which module still pulls it eagerly rather than guessing.
- The whiteboard/terminal surface breaks on open (blank canvas, missing terminal) after the change and one reasonable fix attempt fails — report; do not ship a broken surface to save bundle size.

## Maintenance notes

- The terminal-rail-open-by-default behavior partly negates the terminal's own boot win; if the maintainer wants the full win there, gate the rail's initial render behind user intent (a separate UX decision) — the code split from this plan is the prerequisite either way.
- Any future extension that pulls a heavy client-only lib (a charting lib, a video player) should register its view via `lazy()` from the start — this plan establishes the pattern.
- A reviewer should confirm the extension _descriptor_ (tools, view metadata, icon) still registers synchronously — only the view's rendered body is deferred. If tool registration ever depends on the heavy module, the split is invalid.
