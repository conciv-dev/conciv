# Plugin System — Slice 2 (file-based discovery + HMR, client side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A consumer drops a file in `conciv/extensions/` and the widget picks it up live — no manual `window.__CONCIV__` wiring. The unplugin discovers extension files, registers their client halves into the running widget, and hot-reloads on edit.

**Architecture:** Discovery + injection happen in the existing `@conciv/plugin` vite hook (`makeViteHook`). A vite **virtual module** (`virtual:conciv-extensions`) uses `import.meta.glob` to import every `conciv/extensions/*` module and feed each default export to `window.__CONCIV__.use(...)`. The widget's existing `installExtensionGlobal` (Slice 1) applies them live. The hard part — verified against the running example app, not assumed — is **injecting the virtual module as a real vite-graph module so HMR works on both the static (`transformIndexHtml`) and SSR (`makeWidgetInject`) paths**.

**Tech Stack:** unplugin/vite hook, `import.meta.glob`, vite virtual modules + HMR, SolidJS widget (consumes via Slice 1's reactive store).

## Global Constraints

(Same as Slice 1: functions not classes; no narration comments; real-browser tests only, no jsdom/mocks; pre-release break-freely; turbo build; stay in the worktree; commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.)

- **No new dependencies without asking.** This slice needs none (vite does TS-in-browser). The server half (Slice 3) will want `jiti` — get approval there, not here.
- Verify the injection/HMR path against `apps/examples/tanstack-start` (SSR) AND a static path before claiming done. Do not assume vite transforms injected inline scripts on the SSR path — it does not.

---

## Open design point to resolve empirically (do this FIRST, before writing tasks as final)

The widget script is injected two ways and they behave differently for a client runtime module:

- **Static path:** core's `htmlTags()` (`packages/core/src/widget-tags.ts`) returns tags consumed by vite's `transformIndexHtml`. Vite _will_ transform an inline `<script type="module">` here, so `import 'virtual:conciv-extensions'` resolves and gets HMR.
- **SSR path (tanstack-start):** `makeWidgetInject` (`packages/plugin/src/core/widget-middleware.ts`) appends `widgetTags()` to the final HTML _after_ vite's pipeline. An injected inline module script is **not** transformed — a bare `virtual:` specifier would 404 in the browser.

**Resolution to verify:** serve the extensions entry as a real URL from a vite middleware (same dev origin as the widget script) by delegating to `server.transformRequest('virtual:conciv-extensions')`, and reference it with `<script type="module" src="/@conciv/extensions.js">`. Confirm whether HMR fires through this path; if not, fall back to injecting via vite's module graph (e.g. add the entry to `server.moduleGraph` / use `/@id/` URL) so the HMR client registers. **Spike this against the running example before finalizing Task 2.**

---

## File Structure

- `packages/plugin/src/core/extensions.ts` **(create)** — the virtual-module id + `loadExtensionsModule(root)` returning the glob+register source; `makeExtensionsServe(server)` middleware.
- `packages/plugin/src/core/vite.ts` **(modify)** — register `resolveId`/`load` for the virtual module; mount the extensions middleware; add the extensions script tag to the injected tags.
- `packages/core/src/widget-tags.ts` **(modify)** — add the extensions `<script type="module">` tag (static path) behind a flag so it only appears when extensions are enabled.
- `apps/examples/tanstack-start/conciv/extensions/blue.ts` **(create)** — a sample extension (plain `{id, clientFn}` shape; no runtime import needed yet) used by the e2e.
- `apps/examples/tanstack-start/e2e/extensions.spec.ts` **(create)** — real-browser e2e: the sample extension applies (accent override + a composer button) and HMR re-applies on edit.

---

## Tasks (draft — finalize Task 2 after the spike)

### Task 1: Virtual module that globs + registers extensions

**Files:** Create `packages/plugin/src/core/extensions.ts`; modify `packages/plugin/src/core/vite.ts`.

**Interfaces:**

- Produces: `EXTENSIONS_VIRTUAL_ID = 'virtual:conciv-extensions'`, `EXTENSIONS_RESOLVED_ID = '\0virtual:conciv-extensions'`, `extensionsModuleSource(): string`.
- The source uses `import.meta.glob('/conciv/extensions/*.{ts,tsx,js,jsx}', {eager: true})` and for each module's `default` calls a register helper that (a) pushes to `window.__CONCIV__.queue` if `use` isn't ready, (b) calls `window.__CONCIV__.use(ext)` if it is.

- [ ] **Step 1:** Write `extensions.ts` exporting the ids + `extensionsModuleSource()`. The returned source (string) is the module body vite will transform:

```ts
// packages/plugin/src/core/extensions.ts
export const EXTENSIONS_VIRTUAL_ID = 'virtual:conciv-extensions'
export const EXTENSIONS_RESOLVED_ID = '\0' + EXTENSIONS_VIRTUAL_ID

export function extensionsModuleSource(): string {
  return `
const mods = import.meta.glob('/conciv/extensions/*.{ts,tsx,js,jsx}', { eager: true })
const apply = (ext) => {
  if (!ext) return
  const g = (window.__CONCIV__ ??= {})
  if (g.use) g.use(ext)
  else (g.queue ??= []).push(ext)
}
for (const key of Object.keys(mods)) apply(mods[key].default)
if (import.meta.hot) import.meta.hot.accept()
`
}
```

- [ ] **Step 2:** In `vite.ts`, add `resolveId(id)` returning `EXTENSIONS_RESOLVED_ID` when `id === EXTENSIONS_VIRTUAL_ID`, and `load(id)` returning `extensionsModuleSource()` when `id === EXTENSIONS_RESOLVED_ID`.
- [ ] **Step 3:** Typecheck the plugin: `pnpm turbo typecheck --filter=@conciv/plugin`.
- [ ] **Step 4:** Commit.

### Task 2: Inject the extensions entry (FINALIZE AFTER SPIKE)

**Files:** modify `packages/plugin/src/core/vite.ts`, `packages/plugin/src/core/widget-middleware.ts`, `packages/core/src/widget-tags.ts`.

- [ ] **Step 1:** Spike: run `apps/examples/tanstack-start` dev server with a hand-added extensions script and confirm the chosen injection mechanism loads + HMRs. Write down what worked.
- [ ] **Step 2:** Implement the verified mechanism in both tag paths (static `htmlTags`, SSR `widgetTags`), gated so it only appears when extensions are enabled.
- [ ] **Step 3:** Commit.

### Task 3: Example extension + real-browser e2e

**Files:** Create `apps/examples/tanstack-start/conciv/extensions/blue.ts` + `apps/examples/tanstack-start/e2e/extensions.spec.ts`.

- [ ] **Step 1:** Sample extension (plain object shape, no runtime import):

```ts
// apps/examples/tanstack-start/conciv/extensions/blue.ts
export default {
  id: 'blue',
  clientFn(mx: {ui: {setTheme: (t: Record<string, string>) => void}; registerComposerAction: (d: unknown) => void}) {
    mx.ui.setTheme({'pw-accent': 'rgb(37, 99, 235)'})
  },
}
```

- [ ] **Step 2:** e2e (Playwright, matching the example's `e2e/` convention): load the app, open the widget, assert `--pw-accent` resolved to blue. Then edit the file (change the color), assert HMR re-applies. Use native assertions only.
- [ ] **Step 3:** Run `pnpm --filter <example> e2e`; commit.

---

## Follow-up (later slices)

- **Slice 3 — Server half + tools:** add `jiti` (ASK FIRST) to jiti-load `.server` halves in core boot; wire `toolDefinition().server()` + `registerTool` + `systemPrompt.append` into `@conciv/core start`; ship a runtime `@conciv/widget/extension` export (build change) so files can `import { defineExtension, toolDefinition }`.
- **Slice 4 — Catalog + legibility:** live `conciv_ui catalog/scaffold/validate` from `TOKENS` + registries; the `conciv-extensions` skill; `examples/extensions/`.
- **Slice 5 — Reach tiers 2-3:** `ui.setWidget/setHeader/setFooter/setStatus`, `registerToolRenderer`, `ui.setComponent`.
