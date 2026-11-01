# Stage 5: Initial Zoom Out

Target: `docs/designs/devframe-migration.md`, lines 1-853. Reviewer: egm-zoom-out (fresh context, no GoldfishContext). Standard: zoom-out-standard.md.

Verdict: Context Sufficiency passes. No Blockers. 7 Major, 8 Nit.

## Major

1. **Rsbuild is new scope and contradicts the Non-Goals** (lines 90-91, 150, 540-544). Non-Goals exclude Rsbuild from the first pass, but PR 1 item 13 creates `packages/plugin/src/rsbuild.ts` and a new export; conciv has no Rsbuild entry today. Drop item 13 and the table row; add Rsbuild when asked.
2. **esbuild and rollup hosts are missing from "every host"** (lines 59-62, 142-150, 402, 549). `@conciv/plugin/esbuild` and `/rollup` ship today; the widget is hard-wired to `/__conciv/` on the page origin, while today it reads `conciv-api-base` (`widget-middleware.ts:17`). Either record dropping those hosts, or keep reading the hub base from the existing meta tag.
3. **Agent and MCP data flow in Vite DevTools mode is undefined** (lines 63-64, 147, 211-216, 518-521). Which hub's agent host the MCP endpoint delegates to, whether page tools use the Vite DevTools bridge, and which token gates chat and MCP when Vite DevTools' login is the only one.
4. **PR 19 settings page is a new feature inside a transport migration** (lines 84-85, 203-209, 227, 720-756). No Goal mentions a settings UI. Cut to "existing settings keep working" or move to its own design.
5. **Dual-path double-write is more than needed** (lines 231-234, 239-242, 554-559). Mirroring every push-channel mutation into shared state for groups not yet moved writes state no one reads. Publish shared state only in the PR that moves each group (item 24's `publish(group)`).
6. **Engine-reachability UX deleted with no replacement** (lines 767-771, 187-191). `packages/client/src/reachability.ts` drives the widget's offline behavior through TanStack Query's `onlineManager`. Feed it from the Devframe connection status instead of deleting it.
7. **Open Questions contradict the plan** (lines 95-97 vs 187-191, 482-488; 106-107 vs 302-310). Restart handling is "not designed yet" but Components and item 6 design it.

## Nit

1. `conciv({devframes: {defaults, add, remove}})` adds knobs nobody asked for (lines 137-138, 495); `add` alone is enough.
2. `ConcivError`/`fromWireError` beside the CLI's existing tagged envelope (`packages/cli/src/failure.ts`); contract error maps (e.g. `APPROVAL_DENIED`) must move with the schemas in item 24 (lines 162-164, 463-468).
3. Implementation detail in the architecture section (lines 196-199, 139-140, 249, 205-209).
4. Large-payload slowdown unmeasured (lines 103-105, 707-709); measure recorder keyframes and design frames before PR 1.
5. try-it "move or drop" undecided (lines 226, 718).
6. #649 `PANEL_SHEET` fix is unrelated to the migration (lines 568-572); ship on its own.
7. "About 140 lines" covers only part of the conciv layer (lines 67-69, 365).
8. Items numbered out of order: PR 19 uses 41-44, PR 20 uses 30-40 (lines 720-833).
