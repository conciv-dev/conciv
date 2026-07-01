# Remove the Legacy `@conciv/extensions` (plural) Package

> **For agentic workers:** execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Delete the legacy plural `@conciv/extensions` package so there is exactly one extension package — the singular `@conciv/extension` (the new import-based, bundler-split contract). No back-compat (v0, nobody uses it).

**Context:** The split migration already landed (commit `a148088`): `__`-internal builder, `splitExtension` (bidirectional collapse + DCE), `mountWidget(extensions)`, no `__CONCIV__` registry. The plural package is now mostly dead; this plan removes the remainder.

## Current state (verified)

Plural `@conciv/extensions` = 4 files. Live consumers (only 4 import sites):

- `contract.ts` — **dead** except `ExtensionServerTool` / `ExtensionServerContributions` (the singular package already exports identical shapes). The old `defineExtension`/`defineTool`/`ClientApi`/`ServerApi`/`UiFactory`/`EmptyStateFactory`/`ExtComposerAction` have **no importers**.
- `discovery.ts` (`collectServerContributions`/`collectClientContributions`/`extensionsModuleSource`) — **fully dead** (the plugin now defines its own; singular has its own collect).
- `catalog.ts` (`buildCatalog`/`scaffold`/`validateSource`) — **alive**, imported by `tools/src/server.ts` for the `conciv_extensions` agent tool. Describes the OLD API and must be rewritten.
- Type-only imports of `ExtensionServerTool`/`ExtensionServerContributions`: `core/src/app.ts:5`, `core/src/engine.ts:6`, `core/src/api/mcp/mcp.ts:5`.

Package deps on plural: `core`, `widget`, `plugin`, `tools` (and the plural pkg itself).

## Global Constraints

- v0, break freely; no shims. Code-style HARD rules (no comments-as-narration beyond one concise line matching surrounding files, no `any`/cast, functions not classes, no `else`). Build/typecheck via turbo. Run from the worktree.

---

## Workstream A — Re-point the type imports (trivial, mechanical)

### Task A1: core consumes `ExtensionServerTool`/`ExtensionServerContributions` from the singular package

**Files:**

- Modify `packages/core/src/app.ts:5`, `packages/core/src/engine.ts:6`, `packages/core/src/api/mcp/mcp.ts:5` — change `from '@conciv/extensions'` → `from '@conciv/extension'`.
- Modify `packages/core/package.json` — remove the `@conciv/extensions` dependency (keep/add `@conciv/extension`).

- [ ] **Step 1:** edit the 3 imports.
- [ ] **Step 2:** drop the plural dep from `core/package.json`; ensure `@conciv/extension` is present.
- [ ] **Step 3:** `pnpm install` then `pnpm turbo typecheck build --filter=@conciv/core` → PASS (shapes are identical, so this is a clean swap).
- [ ] **Step 4: Commit** — `"refactor(core): consume ExtensionServerTool from the singular @conciv/extension"`.

### Task A2: drop the now-unused plural dep from widget + plugin

**Files:** `packages/widget/package.json`, `packages/plugin/package.json` — remove `@conciv/extensions` (the split migration already re-pointed their code to singular; confirm with `grep -rn "@conciv/extensions'" packages/{widget,plugin}/src` → no hits).

- [ ] **Steps:** confirm no source imports plural; remove the deps; `pnpm install`; `pnpm turbo typecheck --filter=@conciv/widget --filter=@conciv/plugin` → PASS; commit `"chore: drop legacy @conciv/extensions dep from widget + plugin"`.

---

## Workstream B — Rewrite + relocate the authoring catalog (the real work)

The catalog/scaffold/validate is the `conciv_extensions` agent tool's surface. It currently teaches the OLD API; it must be rewritten to the new contract, then it can move into the singular package. **This is a rewrite, not a move** — design the new scaffolds to match the shipped Component/`useSlot`/`useContext`/`theme`/`.client()`/`.server()`/`.render()` surfaces.

### Task B1: new-contract catalog surfaces + templates + validation

**Files:**

- Create `packages/extension/src/catalog.ts` (node-safe; imports `@conciv/ui-kit-system/tokens` like today) exporting `buildCatalog`/`scaffold`/`validateSource` + the `Catalog`/`CatalogToken`/`ScaffoldKind` types.
- Add a `./catalog` export to `packages/extension/package.json`.

Rewrite content (replacing the old API):

- **conventions:** `entry: "export default defineExtension({name}).client(() => …).server(() => …)"`; `location: "conciv/extensions/*.{ts,tsx}"`.
- **surfaces:** drop `ui.setTheme/setWidget/setHeader/setFooter/setStatus/setEmptyState` and `registerComposerAction`. Replace with the real surfaces: a `Component` that branches on `useSlot()` (slots: `header`/`footer`/`composer`/`empty`/`status`/`widget`), reads host state via `useContext(select?)`, the declarative `theme` field, and `tools: [defineTool(...).server(execute).render(Card)]`, `.client(() => ({value, dispose}))`, `.server(() => ({tools, systemPrompt}))`.
- **TEMPLATES:** rewrite every kind to the new shape — `name` not `{id}`, hoisted `Component` function branching on `ext.useSlot()`, `theme` as a field, `.client()`/`.server()` factories, `defineTool(...).render(Card)`. (`__client`/`__server`/`__execute`/`__render` are internal — never appear in authored templates.)
- **validateSource:** check `export default defineExtension({name})`; validate `theme` field token names against `TOKENS` (overridable warning) instead of `setTheme(...)`; flag a top-level `node:*` import outside `.server()` (mirrors the split's own rule).

- [ ] **Step 1:** write `packages/extension/test/catalog.test.ts` (move + rewrite from `packages/extensions/test/catalog.test.ts`) asserting the new conventions string, that a scaffolded `full` template contains `defineExtension({name:` + `.client(` + `.server(` + `useSlot`, and that `validateSource` rejects a missing default export and an unknown theme token. Run → FAIL.
- [ ] **Step 2:** implement `catalog.ts` to pass.
- [ ] **Step 3:** `pnpm turbo build typecheck test --filter=@conciv/extension` → PASS.
- [ ] **Step 4: Commit** — `"feat(extension): authoring catalog/scaffold/validate for the new contract"`.

### Task B2: re-point the agent tool to the new catalog

**Files:** `packages/tools/src/server.ts:8` — `import {buildCatalog, scaffold, validateSource} from '@conciv/extension/catalog'`; `packages/tools/package.json` — swap the plural dep for `@conciv/extension`.

- [ ] **Steps:** edit import + dep; `pnpm turbo build typecheck --filter=@conciv/tools` → PASS; commit `"refactor(tools): conciv_extensions tool uses the new-contract catalog"`.

### Task B3: rewrite the SKILL + agent-tool IT

**Files:**

- `packages/harness/plugins/claude/skills/conciv-extensions/SKILL.md` — rewrite examples to the new contract (`name`, `.client()/.server()/.render()`, Component+`useSlot`, split, no `ui.setX`/`register`).
- `packages/core/test/api/mcp/extension-tools.it.test.ts` — update assertions to the new surface (it already imports the singular `@conciv/extension`; verify catalog/scaffold/validate over MCP reflect the new shape).
- [ ] **Steps:** rewrite SKILL; update IT; `pnpm turbo test --filter=@conciv/core` (the extension-tools IT) → PASS; commit `"docs(extensions): SKILL + agent-tool IT reflect the new contract"`.

---

## Workstream C — Delete the plural package (easy, after A + B)

### Task C1: delete `packages/extensions` and scrub references

**Files:**

- Delete `packages/extensions/` entirely (`contract.ts`, `discovery.ts`, `catalog.ts`, `index.ts`, `test/*`, `package.json`, configs).
- Remove it from the pnpm workspace globbing if explicitly listed; remove any `turbo`/tsconfig references.
- `grep -rn "@conciv/extensions'" packages | grep -v node_modules` → **zero hits** (the regression gate).

- [ ] **Step 1:** confirm zero importers (grep above).
- [ ] **Step 2:** `rm -rf packages/extensions`; `pnpm install`.
- [ ] **Step 3:** `pnpm turbo build typecheck test` across the workspace → PASS.
- [ ] **Step 4: Commit** — `"chore: delete the legacy @conciv/extensions package — one extension package remains"`.

---

## Effort / risk

- **A (re-point types):** ~30 min, mechanical, near-zero risk (identical shapes).
- **B (catalog rewrite + SKILL):** the substantive piece — a few hours. It is _design_ (good new-contract scaffolds), not a move. Risk: scaffolds must generate extensions that actually compile + split correctly. Mitigate by having `catalog.test.ts` assert the scaffold shape and (optionally) running a scaffolded `full` template through `splitExtension` in a test.
- **C (delete):** ~30 min, gated by the zero-importers grep.

## Open points

1. Catalog home: `@conciv/extension/catalog` subpath (proposed) vs a separate `@conciv/extension-authoring` package. Subpath is simplest and the catalog is node-safe + tiny.
2. Whether to assert scaffold→`splitExtension` round-trips in `catalog.test.ts` (recommended — proves the scaffolds are valid new-contract source).
