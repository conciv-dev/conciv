# Codebase details lens (BRAINSTORM)

All paths under packages/ in the aidx-text worktree.

## A. What the hypothesis gets wrong

1. Blocker: font size, line height, weight and radius deltas can never fire against an image target. `extensions/design/src/server/deltas.ts:61` `sideStyles` for the target returns only `{background, color?}`; typography (`deltas/typography.ts:10-14`) and radius (`deltas/radius.ts:7-9`) need numbers on both sides. Today the text stage can only hold `text` deltas, paint only background and foreground. Staging those kinds needs target-side measurement first (font size from glyph height, radius from corner sampling, or model nodes).
2. Blocker: "everything downstream reads only the TargetModel" holds only for the raster and top-level text runs. `TargetNode.fills/typography/layout` are stored but no diff code reads them. `tool/steps/diff.ts:189-193` reads text only from `root.children` of kind text. Matcher and deltas measure the target from pixels (`deltas.ts:73-94`). A Figma adapter filling nodes changes nothing downstream.
3. Major: OCR runs every time after the adapter (`target.ts:60-62`). Color enricher skipped only when `node.fills` set (`enrichers/color.ts:7`) and runs before OCR children are added, so it samples only the root. Image adapter emits a root with no children.
4. Major: the server does not know routes and has no page text. `writeCapture` stores PNGs; `ComponentReportSchema` has no `text`. Route knowledge exists only for TanStack: `extensions/tanstack/src/server/route-manifest.ts:81-85` parses `src/routeTree.gen.ts`, exposed as `tanstack_route_manifest` and `tanstack_navigate`. Tanstack is not in the `@conciv/it` bundle (`it/src/plugin-instance.ts:14`). General contract `FrameworkServerCore.manifest.routes()` in `protocol/src/framework-types.ts:174-177`. Core DB `navigation` table holds one row of history hrefs, no text. No general page navigate tool (page tools have `route` and `reload`).
5. Major: "app facts the server knows" one-third true. `BundlerBridge.config()` returns `{root, base, mode, aliases, plugins}` (Vite plugin names, not framework detection). `ServerApi` gives `cwd`, `stateDir`, `bundler?`, `nativeUrl`; no routes, no source roots. Design hard-codes `join(cwd, 'src')` as CSS root. Framework detection is client-side only (`FrameworkClientCore.detect()`, `tanstack_detect`).
6. Major: core has SQLite (`.conciv/conciv.db`, `node:sqlite` DatabaseSync plus drizzle, WAL, migrations; `db/src/db.ts:13-24`) but `ServerApi` does not expose it. Whiteboard opens its own `whiteboard.db` with `@libsql/client`, a different driver. Design has neither dependency. SQLite means (a) a `db` field on `ServerApi` (contract change) or (b) a design-owned DB like whiteboard (new dependency, migrations folder).
7. Major: "nothing drives these tools" overstated. `harness-init/src/agent-guide.ts:20` already has the target/edit/diff/fix/diff/stop loop, rendered into the Claude SKILL.md (`claude/plugin-files.ts:64-96`) and the AGENTS.md section (`cli/src/init/steps/harness/agents-md.ts:21-39`). Missing: ordering, stop budget, route discovery.
8. Major: `design_start` would not be an MCP tool the agent calls directly. MCP registers `execute` (TypeScript sandbox), `discover_tools`, and `approval: 'ask'` tools (`core/src/api/mcp.ts:212-247`); capabilities appear as `external_*` functions with descriptions cut to the first sentence (`ai/src/server/code-mode.ts:109`). Agents also use the CLI `.conciv/bin/conciv tools design ...`. The skill must address both.
9. Major: four skill channels, none design-specific: (a) Claude plugin skill, (b) AGENTS.md section, (c) `@conciv/skills` via `@tanstack/intent` (`cli/src/init/steps/docs-pack.ts`), (d) extension `systemPrompt`, written only for harnesses conciv spawns (`core/src/start.ts:124-142`); MCP `instructions` carry only the code-mode prompt. Design defines no `systemPrompt`, `promptSnippet` or `promptGuidelines` though core joins them onto tool descriptions (`core/src/app.ts:156`). `ExtensionCommand` declared, unused.
10. Nit: six design tools (target, diff, status, capture, winner, clear).
11. Nit: `design_status` already returns a score per width `{route, targets:[{id, width, mismatch, above, lastAt}], done}`. Missing: per-stage deltas, rounds, approval, history. `lastAt` parsed from the `livePath` filename (fragile).
12. Nit: residual partly exists: ranking puts measured deltas first then mismatch times area; above-gate no-delta components kept only if leaves; diff image written every run.

## B. Reuse

- `liveRoute`, `targetWidth` in target.ts. `design_diff` refuses with `route-mismatch` unless the tab is on the route (diff.ts:66-74); `tabCapture` shoots the current tab ignoring `route`. A driver must navigate before it diffs.
- `TargetAdapter` and `adapters` registry; reuse `targetStep`, do not fork.
- Server tools receive a `tools` registry handle (`extension/types.ts:60-66`) and can call `tanstack_route_manifest` or page tools. Design's `ServerStep` type drops that argument (`shared/types.ts:236-241`); widen it.
- `sourceChanges` from bundler `hmr-update` (`server.ts:41-50`), already in the x-ray.
- `server/breakpoints.ts` for cross-width flags.
- `xray/fix-prompt.ts:20-24` already turns deltas into "fix X at file:line"; reuse for the brief.
- If design gets a DB, follow `node:sqlite` plus drizzle (`db/src/db.ts`), not libsql.
- `CONCIV_COMMAND_GUIDE` (`agent-guide.ts:5-21`) is the single source both skill channels render. Extend it or add `skills/skills/conciv-design/SKILL.md`; no third channel.

## C. Missing

1. A route source without TanStack, and a navigation primitive.
2. A text index of pages for matching.
3. Target-side typography and radius measurement.
4. SQLite access decision and migration of `.conciv/design/*/record.json`.
5. Approval recording: x-ray router read-only (`server/xray-routes.ts:17-36`); `TargetRecord` has no approval fields.
6. Definition of a round and where the budget lives.
7. Stage server-side in `DiffReportSchema` (changes public schema and `xray/data.ts`) or in the skill.

## D. Observability

- Major: OCR failure only in `TargetResult.text.error`, not kept with the target. Store OCR outcome and `source.kind` with the target; show in `design_status`.
- Major: 20 runs kept, no session or round id. Record `sessionId` (on `ToolRequest`) and round per run.
- Major: route matching and the ask branch invisible. Store candidates, scores, reason.
- Nit: run timing from filenames; store `ranAt` and duration.
