# The component catalog: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before an agent writes a line, `design_get` and `design_components` tell it which components the project already has, ranked, with the import line and the props that matter; after a round, the mapping records which components rendered which design nodes, both ways.

**Architecture:** A static walk from the project's Vite entries (`oxc-resolver` + `oxc-parser`) produces modules, import edges and component candidates. A catalog store ranks them and keeps the last scan with a fingerprint; a read whose fingerprint differs rescans. One `components` module serves the MCP tool, the CLI command and the `design_get` section. The relation table is filled from the mapping each round stores and backfilled once.

**Tech Stack:** TypeScript, Vite 8, `oxc-parser`, `oxc-resolver`, drizzle on `node:sqlite`, zod, `@conciv/extension` (`defineTool`, `ExtensionCliCommands`, sources).

**Spec:** `docs/superpowers/specs/2026-11-09-design-components-design.md`

## Global Constraints

- Package coding rules: one export per file, functions only, no comments, no casts, no `any`, no `else`, no `let`, files under 600 lines, no new numeric constants (thresholds come from `designConfig`), no dynamic imports, library first.
- The walk never executes the server and never executes arbitrary config except through Vite's own `loadConfigFromFile`.
- A project with no components gets no new section in any reply, not an empty one.
- Commit locally, never push, never open a PR, no attribution lines.
- Gates per task: `pnpm typecheck && pnpm lint && pnpm build` in `packages/extensions/design`; `pnpm typecheck && pnpm lint` in `packages/it`; the named IT file only where a task says so.
- Until the design branch carries `home-db.ts`, catalog tables live in the design extension's tables (the checkout's `conciv.db`) behind `createCatalog(db)`; moving them is a later task and changes no caller.

## Review Focus

1. A `vite.config.ts` that imports a package not installed in the repo: `loadConfigFromFile` throws; the walk must report "config unreadable at <path>" and continue with other roots, never abort the scan. Test in Task 1.
2. A component exported under two names (`export {Button, Button as PrimaryButton}`): one id, two names; the catalog lists it once with aliases. Test in Task 1.
3. A circular import between two modules: the walk terminates and counts each edge once. Test in Task 1.
4. A `Props` type imported from a file the walk never reached (outside every entry): props read "see file", no crash. Test in Task 1.
5. A round whose mapping has a source line in a file with no component (plain `index.html` markup): the relation row is skipped, nothing else fails. Test in Task 5.

---

### Task 1: The walk

**Files:**

- Create: `packages/extensions/design/src/server/catalog/walk.ts` (export `walkProject`)
- Create: `packages/extensions/design/src/server/catalog/entries.ts` (export `viteEntries`)
- Create: `packages/extensions/design/src/server/catalog/parse-module.ts` (export `parseModule`)
- Create: `packages/extensions/design/src/shared/catalog-defs.ts` (export `CatalogSchemas`: zod for `Component`, `ModuleEdge`, `Scan`, and the types `ComponentSource = {name: string; scan(input: {cwd: string}): Promise<Scan>}` and `Hinter = {name: string; hint(input: {design: Design; ranked: Ranked[]; config: CatalogConfig}): Map<string, Hint>}`)
- Create: `packages/extensions/design/src/server/catalog/vite-oxc-source.ts` (export `createViteOxcSource(): ComponentSource`, wrapping `walkProject`)
- Modify: `packages/extensions/design/package.json` (add `oxc-resolver` from the catalog; `oxc-parser` is already there)
- Test: `packages/it/test/design.it.test.ts`, new `describe('catalog walk')`

**Interfaces:**

- Produces: `createViteOxcSource(): ComponentSource` and `walkProject({cwd, fingerprint}): Promise<Scan>` where `Scan = {fingerprint: string; modules: string[]; edges: ModuleEdge[]; components: Component[]; unreadable: string[]}`; `Component = {id: string; names: string[]; file: string; pkg: string | null; version: string | null; specifier: string; renders: boolean; sentence: string | null; props: PropSketch[] | 'see file'; usage: string | null; story: string | null}`; `ModuleEdge = {from: string; to: string}`.
- `id` is `sha256(repoRelativeFile + ':' + exportName)` for workspace files and `sha256(pkg + '@' + version + ':' + exportName)` for dependencies.

- [ ] **Step 1: Write the failing tests** in `design.it.test.ts`, `describe('catalog walk')`, against the fixture host `packages/it/test/fixtures/design/host`:
  - `walks from the fixture's vite config`: `scan.components` contains one with `names` including `XrayPage`, `renders: true`, `file` ending `src/XrayPage.tsx`, `specifier` `./src/XrayPage.tsx`.
  - `resolves the workspace kit to source`: a component with `names` including `SegmentGroup`, `pkg: '@conciv/ui-kit-system'`, `file` ending `segment-group.tsx`, `sentence` non-null (from its doc comment or README).
  - `counts each edge once in a cycle`: the fixture gains two files importing each other (`cycle-a.ts`, `cycle-b.ts`) imported from the host entry; `edges` holds exactly one `a→b` and one `b→a`.
  - `reports an unreadable config and continues`: a temporary root with a `vite.config.ts` that imports `not-installed-pkg`; `scan.unreadable` names that path and `scan.components` is non-empty from the other root.
  - `lists aliases once`: fixture exports `export {Stat as StatCard}` beside `Stat`; one component with `names` `['Stat', 'StatCard']`.
  - `props say see file when the type is out of reach`: fixture component with `props: FarProps` imported from a file no entry reaches; `props === 'see file'`.
- [ ] **Step 2: Run them**: `pnpm run test:it -- design -t 'catalog walk'` in `packages/it`. Expected: FAIL, `walkProject` not found.
- [ ] **Step 3: Implement `viteEntries({cwd}): Promise<{root: string; entries: string[]; resolve: ResolveOptions; unreadable: string[]}[]>`** in `entries.ts`: find every `vite.config.{ts,mts,js,mjs}` under `cwd` (skip `node_modules`, `dist`, `.git`), load each with Vite's `loadConfigFromFile`, take `build.rollupOptions.input` else `index.html` under the root, and `resolve.alias` + `resolve.conditions` for the resolver.
- [ ] **Step 4: Implement `parseModule({file, source}): {imports: string[]; exports: ExportFact[]; renders: Set<string>; docs: Map<string, string>}`** in `parse-module.ts` with `oxc-parser`'s `parseSync`: static imports and re-exports; exported function and arrow declarations; `renders` when the body holds a `JSXElement`/`JSXFragment`, or for a `.d.ts` when the declared return type names `JSX.Element`, `Element` or a type ending in `Component`; the first sentence of the leading doc comment.
- [ ] **Step 5: Implement `walkProject`** in `walk.ts`: BFS from every entry through `oxc-resolver` (`ResolverFactory` with the root's alias and conditions), `parseModule` per file, edges deduplicated as a `Set` of `from→to`, components from exported renderers; `pkg`/`version` from the nearest `package.json` when the file is under `node_modules`; `specifier` is the import path a project file would write (the package name for a dependency or workspace package, the relative path otherwise); `props` from the parameter's inline type or one hop to a `Props` type in the same walk, else `'see file'`; `usage` the shortest story file importing it, else the shortest call site line.
- [ ] **Step 6: Run the tests.** Expected: PASS. Gates.
- [ ] **Step 7: Commit** `design: the catalog walks the project from its vite entries`.

### Task 2: The catalog store, rank and freshness

**Files:**

- Create: `packages/extensions/design/src/server/catalog/catalog.ts` (export `createCatalog`)
- Create: `packages/extensions/design/src/server/catalog/rank.ts` (export `rankComponents`)
- Create: `packages/extensions/design/src/server/catalog/fingerprint.ts` (export `projectFingerprint`)
- Create: `packages/extensions/design/src/server/catalog/project-key.ts` (export `projectKey`)
- Modify: `packages/extensions/design/src/server/tables.ts` (tables `components`, `component_scans`, `component_flags`, `node_components`)
- Modify: `packages/extensions/design/src/server/sources.ts` (sources `components`, `node_components`)
- Modify: `packages/extensions/design/src/server/migrations.gen.ts` via `pnpm run gen-migrations`
- Test: `design.it.test.ts`, `describe('catalog store')`

**Interfaces:**

- Consumes: `walkProject`, `Scan`, `Component` from Task 1.
- Produces: `createCatalog({db, cwd, config, sources: ComponentSource[]}): {list({live?: string[]}): Promise<Ranked[]>; show(name): Promise<Component & {nodes: NodeRef[]}>; flag(name, flag: 'prefer' | 'do-not-use' | 'clear'): Promise<void>; componentOf(source: string): Component | null; scanIfStale(): Promise<Scan>}`; `Ranked = Component & {rank: number; imports: number; onPage: number; tier: 'kit' | 'app' | 'other'; flag: 'prefer' | null}`.
- `projectKey({cwd}): string` = git remote url + repo-relative package root, else root package name.
- `projectFingerprint({cwd}): string` = `git rev-parse HEAD:` tree hash + sorted dirty paths with mtimes, hashed.

- [ ] **Step 1: Write the failing tests**, `describe('catalog store')`:
  - `rescans when the fingerprint changes`: list, touch a fixture file, list again; `component_scans` has two rows, different fingerprints.
  - `does not rescan when nothing changed`: two lists in a row, one scan row.
  - `ranks prefer first, then on page, then imports`: flag `Chip` prefer; `list({live: [SegmentGroupFile]})` returns `Chip` first, `SegmentGroup` second, then by `imports` descending.
  - `do-not-use hides`: flag `Slider` do-not-use; absent from `list()`; `show('Slider')` still answers.
  - `tiers`: `SegmentGroup` is `kit` (package name contains `ui-kit`), `XrayPage` is `app`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Add the tables** to `designTables`: `components` (id pk, project, names json, file, pkg, version, specifier, renders int, sentence, props json, usage, story, imports int, scanned_at), `component_scans` (seq pk, project, tree, fingerprint, modules int, components int, at), `component_flags` (project, component_id, flag, at; pk project+component_id), `node_components` (seq pk, target_id, round, node, component_id, source). Run `pnpm run gen-migrations`.
- [ ] **Step 4: Implement `rankComponents({components, flags, live}): Ranked[]`**: order by flag prefer, then `onPage` (count of `live` sources under the component's file), then `imports`, then tier `kit` before `app` before `other`, then story present, then sentence present. Tier: `kit` when `pkg` or file path contains `ui-kit`, `ui/`, `design-system`, `components/` under a package not the app's own; `app` when under the scanned root's `src`; `other` otherwise. `imports` is the in-degree of the component's module in `edges`.
- [ ] **Step 5: Implement `createCatalog`** with `scanIfStale` (compare `projectFingerprint` to the last `component_scans` row for this project and tree; walk and replace `components` rows when different), `list`, `show`, `flag`, `componentOf(source)` (longest `file` prefix match on the source's path, then the enclosing export by line range from the scan).
- [ ] **Step 6: Add sources** `components` and `node_components` to `designSources` so `design_query` reads them; extend `SOURCES` text in `tools.ts` with one sentence each.
- [ ] **Step 7: Run the tests.** Expected: PASS. Gates.
- [ ] **Step 8: Commit** `design: the catalog store ranks components and rescans on a changed fingerprint`.

### Task 3: The tool and the CLI command

**Files:**

- Modify: `packages/extensions/design/src/shared/defs.ts` (add `componentsDef` to `DESIGN_TOOLS`; keep the file under 600 lines by moving the new def into `src/shared/components-def.ts` and importing it)
- Modify: `packages/extensions/design/src/server/tools.ts` (server step for `components`)
- Modify: `packages/extensions/design/src/server/commands.ts` (`components` command)
- Create: `packages/extensions/design/src/server/catalog/render-list.ts` (export `renderComponents`: the plain-text list the agent reads, shared by tool and CLI)
- Test: `design.it.test.ts`, `describe('design_components')`

**Interfaces:**

- Consumes: `createCatalog` from Task 2.
- Produces: tool `design_components` with input `{link?: string; show?: string; flag?: {name: string; flag: 'prefer' | 'do-not-use' | 'clear'}}`, output `{text: string; components?: Ranked[]; component?: Component}`; CLI `conciv tools design components list|show <name>|flag <name> <prefer|do-not-use|clear>` with the same `text`.
- `renderComponents({ranked, limits: config.catalog}): string` writes the kit tier in full, the app tier in full when at or under `config.catalog.appTierFull`, the rest as `N more, ask show`; per row: import line, sentence, props that matter, usage, rank facts, flag.

- [ ] **Step 1: Write the failing tests**: through the harness-testkit call tool, `design_components({})` returns text whose first row is the kit tier and contains `import {` and `imports ·`; `design_components({show: 'SegmentGroup'})` returns `component.props` non-empty and text containing the file path; `design_components({flag: {name: 'Slider', flag: 'do-not-use'}})` then `design_components({})` text lacks `Slider`; the CLI `conciv tools design components list` prints the same first row.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `componentsDef`, the server step (resolve the live sources from the target behind `link` through the store's current mapping when given), `renderComponents`, and the `components` CLI command calling the same functions.
- [ ] **Step 4: Run the tests.** Expected: PASS. Gates.
- [ ] **Step 5: Commit** `design: design_components lists the project's components, ranked, for the tool and the CLI`.

### Task 4: The section in `design_get` and the per-node hint

**Files:**

- Modify: `packages/extensions/design/src/server/tools.ts` (`getDef.server` appends the section)
- Modify: `packages/extensions/design/src/shared/defs.ts` / `GetResultSchema` (optional `components: string`, optional per node `hint: {component: string; specifier: string; confidence: number}`)
- Create: `packages/extensions/design/src/server/catalog/name-variant-hinter.ts` (export `createNameVariantHinter(): Hinter`)
- Modify: `packages/extensions/design/src/server.ts` (`DesignRuntime` gains `catalog: {sources: ComponentSource[]; hinters: Hinter[]}` filled from `config.catalog.sources`)
- Modify: `packages/extensions/design/src/server/document.ts` (one rule sentence: "a node with `hint` is probably that component; import it rather than drawing it; ignore the hint when it does not fit")
- Modify: `packages/extensions/design/src/server.ts` (`designConfig` gains `catalog: {sources: ['vite-oxc'], hint: true, section: true, appTierFull, hintConfidence}` with defaults beside `tolerances`; `sources: []` disables scanning, `hint: false` and `section: false` remove each from `design_get` while the tool and CLI stay)
- Test: `design.it.test.ts`, `describe('design_get components section')`

**Interfaces:**

- Consumes: `createCatalog.list`, `rankComponents`.
- Produces: `createNameVariantHinter(): Hinter` whose `hint` returns `Map<nodeId, Hint>`: score per node and component = name similarity (`textSimilarity` from `pairers/similarity.ts`, exported there) on node name vs component names, plus variant fit (a node's enum-like look, size or tone, matching a prop enum) weighted as the existing voters are; a hint only when the best score is at or above `config.catalog.hintConfidence` and beats the second by the same margin rule `vote.ts` uses.

- [ ] **Step 1: Write the failing tests**: `design_get` on the x-ray mockup link in the fixture (the stored REST dump the IT already uses) returns `components` text non-empty and a node named `Segment control` with `hint.component === 'SegmentGroup'`; on a fixture with no components (`vite.config` with no renderers) the reply has no `components` field.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the config, `hintComponents`, the section append and the document rule.
- [ ] **Step 4: Run the tests.** Expected: PASS. Gates.
- [ ] **Step 5: Commit** `design: design_get carries the project's components and a hint per node`.

### Task 5: The relation and its backfill

**Files:**

- Create: `packages/extensions/design/src/server/catalog/relate.ts` (export `relateRound`)
- Modify: `packages/extensions/design/src/server/store.ts` (after a round's mapping is stored, call `relateRound`)
- Modify: `packages/extensions/design/src/server/migrations.gen.ts` (a data migration that runs `relateRound` over every stored round of every target once; generated through the same script, the SQL inserting from `fom` joined by `componentOf` is done in TypeScript at startup when `node_components` is empty and `fom` is not)
- Modify: `packages/extensions/design/src/server/xray-routes.ts` (`xray.layers` carries `component` per node when known)
- Test: `design.it.test.ts`, `describe('node components')`

**Interfaces:**

- Consumes: `createCatalog.componentOf`, the stored mapping (`fom` rows: node, id, source, round).
- Produces: `relateRound({targetId, round, fom, catalog}): number` rows written; `node_components` queryable both ways through `design_query`.

- [ ] **Step 1: Write the failing tests**: after one `design_check` on the fixture, `design_query({from: 'node_components', where: 'round == 1'})` returns rows whose `component_id` resolves through `components` to `XrayPage` or a kit component; a `fom` row whose source is `index.html:…` yields no relation row and no error; a database with rounds and no `node_components` gains rows at startup (open the IT's stored database copy from `checks/` and count).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `relateRound`, the store hook, the startup backfill, the x-ray layer field.
- [ ] **Step 4: Run the tests.** Expected: PASS. Gates.
- [ ] **Step 5: Commit** `design: a round records which components rendered which nodes, both ways`.

### Task 5b: The token map and the drift row (spec section "Token drift")

**Files:**

- Create: `packages/extensions/design/src/server/catalog/token-source.ts` (export `createCssTokenSource`: a `TokenSource` reading CSS custom properties from a stylesheet file, `light-dark(a, b)` split into the two schemes)
- Create: `packages/extensions/design/src/server/catalog/token-map.ts` (export `createTokenMap`: joins kit tokens to the design's variables by value, per scheme; `kitTokenFor({value, scheme})` and `designTokenFor(name)`)
- Create: `packages/extensions/design/src/server/catalog/drift.ts` (export `classifyDrift`: turns the rows of one round into rows plus drift rows)
- Modify: `shared/catalog-defs.ts` (`TokenSource = {name; read({cwd}): Promise<Token[]}`, `Token = {name; value; scheme: 'light' | 'dark' | 'any'; source}`; `CatalogConfig.tokens: string[]` default `['css']`, `CatalogConfig.tokenFiles: string[]` default `[]`: the stylesheets to read; empty means the kit's `exports` stylesheet when the kit tier has one, else nothing)
- Modify: `shared/defs.ts` (`MagnitudeSchema` gains `'token-drift'`; `GateRowSchema` gains optional `component`, `kitToken`, `designToken`)
- Modify: `server/differ.ts` (after `tokenGroups`, when the catalog is on, `classifyDrift`)
- Modify: `server/document.ts` (one rule sentence: a `token-drift` row is a flag, change the kit token or the design variable or report it, never the element)
- Modify: `server/xray-routes.ts` (drift rows reach the card as a flag line with both tokens)
- Test: `design.it.test.ts`, `describe('token drift')`

**Interfaces:**

- Consumes: `relateRound` and `componentOf` (Task 5), `GateRow.token` (the Figma variable bound to the field), the paint row's page value and design value (already in `row.text`; expose them as fields `pageValue`, `designValue` on paint rows if not present).
- Produces: `classifyDrift({rows, relation: Map<node, Component>, tokens: TokenMap}): GateRow[]`; a drift row has `magnitude: 'token-drift'`, `component`, `kitToken`, `designToken`, `text` exactly `"<Component> uses <kitToken> (<pageValue>); the design wants <designToken> (<designValue>)"`; one per component and kit token, the ordinary paint rows it replaces removed.

- [ ] **Step 1: Write the failing tests**: the fixture host imports the kit's `tokens.css`; a frame whose Stat card is bound to a Figma variable `radius/lg` 12px while the kit renders `--chat-radius-md` 8px through SegmentGroup gives one `token-drift` row naming `SegmentGroup`, `--chat-radius-md`, `radius/lg`, and no paint row for that field on that element; a paint row on an element with no relation stays `paint`; `catalog.tokens: []` gives no drift rows and the paint rows back; the `fom` and votes tables are byte-equal with and without `tokens` (pairing untouched).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the three files, the schema fields, the differ hook, the rule, the x-ray flag line.
- [ ] **Step 4: Run the tests.** Expected: PASS. Gates.
- [ ] **Step 5: Commit** `design: a token mismatch inside a known component is a drift flag, not a row to fix`.

### Task 6: Previews

**Files:**

- Create: `packages/extensions/design/src/server/catalog/preview-route.ts` (export `registerPreviewRoute`: the dev-server route `/__conciv/preview/<id>` serving an HTML shell that imports a virtual module mounting the component)
- Create: `packages/extensions/design/src/server/catalog/preview-module.ts` (export `previewModule`: the virtual module source for one component: import by specifier, mount with story or default props, Solid or React decided by the project's framework plugin)
- Create: `packages/extensions/design/src/server/catalog/look-hinter.ts` (export `createLookHinter(): Hinter`: screenshots the preview through the page verbs and compares against the node's design render with the pixel compare `measure.ts` already has)
- Modify: `packages/extensions/design/src/server.ts` (register the route; add the look hinter after the name-variant one)
- Test: `design.it.test.ts`, `describe('component previews')`

**Interfaces:**

- Consumes: `createCatalog.show`, the page verbs' `screenshot_node`, `captured()` from `measure.ts`.
- Produces: `GET /__conciv/preview/<id>` renders the component; `Component.preview: string | {error: string}`; `createLookHinter(): Hinter`.

- [ ] **Step 1: Write the failing tests**: the preview route for `SegmentGroup` returns 200 and the page shows an element with role `radiogroup` or the component's root; for a component whose module throws, `show` returns `preview: {error}` whose text is the first line; the look hinter on the x-ray mockup raises the `SegmentGroup` hint's confidence on the `Segment control` node above the name-only hint.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the route, the virtual module, the look hinter.
- [ ] **Step 4: Run the tests.** Expected: PASS. Gates.
- [ ] **Step 5: Commit** `design: a component renders alone at a preview route; its pixels vote for hints`.

### Task 7: The Parts view

**Files:**

- Create: `packages/extensions/design/src/xray/parts.tsx` (the view: search, filter chips, `@tanstack/solid-table` with sortable columns, `@tanstack/solid-virtual` rows, expanded row detail)
- Modify: `packages/extensions/design/src/xray/overlay.tsx` (rail item "Parts"), `src/xray/data.ts` (rpc `xray.components`), `src/server/xray-routes.ts` (serves `createCatalog.list` with the current round's live sources)
- Modify: `packages/extensions/design/package.json` (`@tanstack/solid-table`, `@tanstack/solid-virtual` from the catalog)
- Modify: `packages/it/test/proof/xray.spec.ts` (walks the Parts view: search narrows, a chip filters, a header sorts, a row expands, the page outlines its elements)

- [ ] **Step 1:** Built through the loop like the other views: register frames `11:108`, `11:397` (dark, `--color-scheme dark`) and `11:572`, the fixture state `?variant=xray&state=parts` serving the mockup's sample catalog (Part K's `serveXraySample` gains the `components` call), two runs of eight checks at most, the table row in `xray-build.md`.
- [ ] **Step 2:** Proof and shots as for the other views.
- [ ] **Step 3: Commit** `design: the overlay parts view`.

### Task 7b: A named component is a row

**Files:**

- Modify: `packages/extensions/design/src/server/catalog/name-variant-hinter.ts` (a hint needs one shared word; score 1 for whole-word names), `src/server/differ.ts` or the row builder the drift rows use (one `component` row per hinted node whose relation disagrees), `src/shared/defs.ts` (`MagnitudeSchema` gains `component`; `GateRow.component` carries name and specifier), `src/server/document.ts` (one rule line: a `component` row is cleared by rendering the node with the named component), `src/xray/panel.tsx` and `card.tsx` (chip "Hand-drawn", the import line in the card)
- Test: `packages/it/test/design.it.test.ts` (or its catalog describes)

**Interfaces:**

- Consumes: `Hinter.hint` (Task 4), `store.relation` (Task 5), `classifyDrift` (Task 5b) for where rows are added.
- Produces: `GateRow` with `magnitude: 'component'`, `component: {name, specifier}`.

- [ ] **Step 1:** Failing IT on the drift fixture: a design node named "Chip" paired to a hand-written `div.chip` gets one `component` row naming `Chip` and `./src/Chip.tsx`; the same node rendered by `<Chip>` gets none; `catalog.hint: false` gives none; `do-not-use` on Chip gives none; `prefer` on Chip with a node named "Tag" (hint under 1) gives one.
- [ ] **Step 2:** Implement; the row text as the spec's "A named component is a row" section gives it.
- [ ] **Step 3:** Hints need one shared word: the fuzzy-only hints ("Part" to `Far`) are gone; IT asserts "Header" gets no hint.
- [ ] **Step 4:** Gates, proof shot of the chip in the round list, commit `design: a named component is a row`.

### Task 7c: A component row fires only where the component can be used

**Files:**

- Modify: `packages/extensions/design/src/server/sources/figma.ts` (per node `figma.component`: the main component's name for INSTANCE and COMPONENT nodes, from the file's `components` map), `src/server/catalog/name-variant-hinter.ts` (certainty only from `figma.component`; layer-name matches stay fuzzy under 1), `src/server/catalog/{entries,walk,vite-oxc-source}.ts` (`Component.framework` from the plugin or parser that saw it render; the walk records each file's framework), `src/server/catalog/component-rows.ts` (rules 2 and 3 of the spec section; the resolved import line), fixture `packages/it/test/fixtures/design/host/vite.config.ts` (the overlay entry as an input so the walk reaches the overlay source)
- Test: `packages/it/test/design.it.test.ts` catalog describes

- [ ] **Step 1:** Failing ITs: a text node named "96K sold so far" gets no `Far` row and no hint of 1; an INSTANCE whose main component is `Avatar` in a React host with a Solid kit gets a hint and no row; the same in a Solid host gets a row with a resolved import line; a node rendered by the project's `RailButton` which renders the kit `Button` gets no row for `Button`.
- [ ] **Step 2:** Implement the three rules; the hint probe (`$S/catalog-task8/hint-probe/probe.ts`) on figma5 then shows only INSTANCE nodes at 1.
- [ ] **Step 3:** Gates, commit `design: a component row fires only where the component can be used`.
- [ ] **Step 4:** Measure again: `xray8-round-cat-1..2` as Task 8 Step 1 ran them; the row count at the first check, which rows the agent cleared and how, kit imports kept. Row in `xray-build.md`.

### Task 7d: A component the page had is a row

**Files:**

- Modify: `packages/extensions/design/src/server/catalog/component-rows.ts` (rule 4 from the previous round's relation, `store.relation({id, round: previous})`), `src/server/document.ts` (one rule line), `packages/it/test/design-catalog.it.test.ts`

- [ ] **Step 1:** Failing IT: a fixture node rendered by the kit `Chip` in round 1 and by a `span.chip` in round 2 gets one `component` row with the spec's text; restored to `<Chip>` in round 3 it gets none; `do-not-use` on Chip gives none; `catalog.hint: false` still gives the row.
- [ ] **Step 2:** Implement; gates; commit `design: a component the page had is a row`.
- [ ] **Step 3:** Measure `xray9-round-cat-1..2` as Task 7c Step 4 ran them; row in `xray-build.md` with the rows the agent cleared by restoring the component and the kit imports kept.

### Task 7e: The call site is stamped

**Files:**

- Modify: `packages/extension-compiler/src/inject-source.ts` (component openings imported from outside the framework package get `data-conciv-site`), its tests; the design client walk (`client.tsx`, split the part touched into its own file: an element with `data-conciv-site` and its unstamped descendants carry `site`), `src/server/catalog/relate.ts` (a `site` resolves through `component_sites`), the fom/store fields that carry the source line (`site` beside `source`), `packages/it/test/design-catalog.it.test.ts`

- [ ] **Step 1:** Failing compiler unit test: `<Chip tone="x">` imported from `@conciv/ui-kit-chat` gets `data-conciv-site="src/Panel.tsx:12"`; `<Show when>` from `solid-js` gets nothing; a host `<div>` gets key and source as before.
- [ ] **Step 2:** Failing IT on a fixture page that renders the kit `Pill` from `src/ui-kit/Pill.tsx`: the relation names `Pill` for the node paired to its root element, and `xray.layers` shows `component.name` Pill.
- [ ] **Step 3:** Implement; gates in `extension-compiler`, `extensions/design`, `it`; the proof; commit `design: the call site is stamped, so a kit component is credited with what it renders`.
- [ ] **Step 4:** Measure `xray9-round-cat-1..2` as Task 7c Step 4 ran them; row in `xray-build.md`: component rows first/last, rows cleared by restoring the component, kit imports kept, the agent's words.

### Task 7f: A site element is a node, and the kit forwards its props

**Files:**

- Modify: `packages/ui-kit-chat/src/**` and `packages/ui-kit-system/src/**` (every component whose root does not spread its rest props; list them first with a scan of `splitProps` calls that drop the rest), the design client walk (`src/client/stamps.ts` and the id-tree builder: a site-only element is a node, id from site plus ordinal), `packages/it/test/design-catalog.it.test.ts`

- [ ] **Step 1:** Kit audit: a unit test per kit package that renders every exported component with `data-probe="x"` and asserts the attribute lands on an element; fix each component it fails on. Commit `ui-kit: every component forwards its rest props to its root`.
- [ ] **Step 2:** Failing IT: a fixture kit component rendered as `createElement` with forwarded props but no key (the `Pill` fixture as it is) and a second one whose call site is the only stamp: both roots are nodes in `xray.layers`, paired, with `component.name`; replacing one with a span gives the rule-4 row.
- [ ] **Step 3:** Implement; gates; commit `design: a site element is a node of the id tree`.
- [ ] **Step 4:** Measure `xray10-round-cat-1..2`; row in `xray-build.md`: Chip credited at the first check yes or no, rule-4 rows first/last, rows cleared by restoring, kit imports kept, the agent's words.

### Task 8: Measure

**Files:**

- Scratch only: `$S/figma-loop/brief-wave21-catalog.md` is written by the orchestrator from this task; no repo file.

- [ ] **Step 1:** Rerun the x-ray round state (`4:2`, `widget: shown`) once with the catalog section in the reply; count kit imports in the final source against the 2026-11-09 run (one).
- [ ] **Step 2:** Six a side on figma5, same head, one arm with the section and hints, one with `design_get` as before (a trial flag `--no-catalog` toggles the section; one commit `it: trial --no-catalog`): done, rows, judge, cost, kit imports. Table `$S/figma-loop/twentyone.md`.
- [ ] **Step 3:** A worse done rate or cost on the tools arm removes the section and the hint from `design_get` (the tool and CLI stay), as the markup ruling did.
