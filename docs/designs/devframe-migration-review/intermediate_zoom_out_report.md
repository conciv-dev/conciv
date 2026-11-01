# Stage 8: Intermediate Zoom Out

Target: `docs/designs/devframe-migration.md`, lines 1-853 (unchanged since stages 5-7). Reviewer: egm-zoom-out (fresh context), with the stage 5, 6 and 7 reports as input. Verdict: Context Sufficiency passes. 1 Blocker, 7 Major, 6 Nit.

Most stage 6 and 7 findings are symptoms of four roots: an accidentally widened agent surface, no single credential and trust model, Vite DevTools mode as a second topology, and the migration double-write. Fix the roots; several requested additions would add prose without removing causes.

## Blocker

1. **Delete the new agent entry points instead of inventorying and gating each** (lines 55-58, 124-125, 136-140, 211-216, 493-497). Today `packages/core/src/api/mcp.ts:212-247` exposes only `discover_tools`, `execute_typescript` and `approval: 'ask'` tools. The design adds Devframe's MCP route, WebMCP and Vite DevTools' agent host, making every `agent` function directly callable outside code mode, caps and mirroring. A gate inside `defineConcivFunction` is the wrong layer (it would gate the widget's own calls). Root fix: use Devframe's agent host only as the in-process registry conciv's MCP endpoint reads; leave Devframe's MCP route and WebMCP off; do not register conciv functions as agent tools in Vite DevTools' hub. This removes the `mcp:` config (line 139, item 7) and critic Nit 8, and keeps `/api/mcp` where it is. Drop WebMCP (line 213) as speculative.

## Major

2. **Credential findings are one missing table** (lines 59-62, 98-102, 139, 147-148, 184-186, 231-232, 251-257, 779-783). Add a three-row table in Security: pairing token (engine bearer), Devframe browser trust (one-time code then stored login), Vite DevTools login. State per-host guarantees honestly in the existing "Loopback guard" column. Real gap: `packages/core/src/app.ts` has no auth today; PR 1 adds a `/api/*` middleware and PR 20 (item 33) deletes it, leaving `/api/chat` open. Make that middleware the engine's permanent gate for all non-hub routes.
3. **Vite DevTools mode is a second topology hidden in PR 1** (lines 63-64, 147, 518-521). Move it out of item 10 into its own PR after PR 20. conciv already works as a Vite DevTools dock (#649).
4. **Terminals-only viewer turns a transport change into a UI redesign** (lines 136, 245-249, 388-395, 697-703). Non-Goals keep implementations and change only transport, yet the terminal view is deleted and four controls move. Alternative D misses: keep conciv's terminal view, move its PTY stream onto a Devframe stream, Terminals plugin off by default. "Shared terminal model" (line 38) serves no goal. _(Note from the orchestrator: Omri decided on 2026-11-01 that Devframe's Terminals plugin is the only terminal; this finding contests that decision.)_
5. **Keep the Risks section small** (lines 88-89, 93-107). Rename Open Questions to "Risks and open questions" with three one-liners: client-runtime bundle size measured once in PR 1; the existing local-patch policy (line 89) as the answer if Devframe stalls; the payload measurement. Measure recorder keyframes, captures and design frames before PR 7 and PR 13; design a fallback only if that fails.
6. **Remove the dual-path double-write rather than enforcing it** (lines 231-234). With `publish(group)` only in the PR that moves each group (item 24), each TanStack Query key has one writer.
7. **The net-reduction claim carries the Alternative A rejection and is unproven** (lines 32-36, 67-69, 363-366). Give one honest net line count including forwarders, Solid hub UI, second `makeAppData` backend, restart handling, login middleware, fault plugin and settings routes. If the net is small, rest the case on login, plugin model and one hub.
8. **PR 19 settings page remains scope creep** (lines 84-85, 203-209, 720-756). The problem asks for settings sync between tabs; publish existing settings (`lib/color-scheme.ts`, `draggable-position.ts`, `__root.tsx`) as shared state. Seven routes, Access, locked Plugins, shortcut recording and runtime `agent.model` are a product feature: own design. _(Orchestrator note: the settings mockup was approved by Omri on 2026-11-01.)_

## Nit

1. Link Devframe's docs once instead of a glossary; define only credential terms.
2. Testing section (lines 259-349) repeats items 18-22 and 38; keep rules and the budget decision in the architecture, inventories in the plan.
3. `service-shiki` and `service-git` have no named consumer (lines 136-137, 448); Shiki runs client-side today (`packages/ui-kit-chat/src/styled/highlight-worker.ts`).
4. Fault-helper fallback: one named line is enough.
5. Stale text: restart contradiction (95-97 vs 187-191), "step 6" (276), "open decision below" (275).
6. Still standing from stage 5: esbuild/rollup hosts dropped silently; deleting `reachability.ts` removes offline UX in about 10 widget files; Rsbuild contradicts its Non-Goal; try-it undecided; `PANEL_SHEET` fix unrelated.

## Asks from stages 6-7 to decline as over-engineering

Per-path agent-entry inventory or a gate in `defineConcivFunction` (replaced by finding 1); per-host security section (finding 2); dual-path lint and precedence rule (finding 6); payload regression budget and pre-designed fallback, Devframe exit plan and maintenance assessment (finding 5); full Devframe glossary (Nit 1). Critic style nits 10-21 are cosmetic.
