# Consolidated Review: Moving conciv onto Devframe

Target: `docs/designs/devframe-migration.md` (853 lines; FeatureRange 1-427, DetailedRange 428-853). Mode: consolidated, all rubrics, no GoldfishContext. Every reviewer ran in a fresh context and completed; none were "not run".

| Stage                      | Report                               | Reviewers                                         | Blocker | Major | Nit |
| -------------------------- | ------------------------------------ | ------------------------------------------------- | ------- | ----- | --- |
| 5 Initial Zoom Out         | `zoom_out_report.md`                 | zoom-out                                          | 0       | 7     | 8   |
| 6 Comprehension            | `comprehension_report.md`            | comprehension                                     | 0       | 10    | 11  |
| 7 Critic                   | `critic_report.md`                   | design, structural, style                         | 1       | 15    | 21  |
| 8 Intermediate Zoom Out    | `intermediate_zoom_out_report.md`    | zoom-out                                          | 1       | 7     | 6   |
| 9 Implementation Readiness | `implementation_readiness_report.md` | implementation-readiness, codebase-details, style | 6       | 22    | 20  |

Overall: **not approvable as written.** The architecture direction holds up under review: no reviewer argued against adopting Devframe. The failures are (1) the agent surface the design opens by accident, (2) a credential the design assumes but the code does not have, and (3) an implementation plan that breaks the "never broken in between" rule and leaves decisions to the implementer. Two Major items contest decisions Omri already made (marked **[contests decision]**); they are recorded, not acted on.

## 🔴 Blockers

**C1. Agent surface widened: tools reachable without the approval gate.** Devframe's MCP route, WebMCP and Vite DevTools' agent host would make every `agent` function callable outside code mode, the approval gate, result caps and chat mirroring. Today `packages/core/src/api/mcp.ts:212-247` exposes only `discover_tools`, `execute_typescript` and `approval: 'ask'` tools. Fix (stage 8's simpler form): use Devframe's agent host only as the in-process registry conciv's MCP endpoint reads; leave Devframe's MCP route and WebMCP off; do not register conciv functions as agent tools in Vite DevTools' hub; `/api/mcp` stays. Removes the `mcp:` config and the `allowedOrigins` concern.

**C2. The credential model is missing, and the "pairing token" does not exist.** The only token is optional `StartOpts.accessToken`, a `/t/<token>` URL prefix set only by `packages/try` (`start.ts:30,157,168`; verified). Vite, Next and webpack boots, the CLI and MCP children send none, so PR 1's `/api/*` middleware would lock them out; PR 20 then deletes the middleware and leaves `/api/chat` open. Fix: one Security table with each credential (engine token, Devframe browser trust, Vite DevTools login): who creates it, where it persists, who reads it, where it is checked; the engine token is created at boot and handed to CLI and harness children through the existing endpoint files; the `/api/*` gate is permanent for every non-hub route; say how `/__conciv/` relates to the `/t/<token>` mount.

**C3. Removing oRPC procedures per group breaks direct callers.** Many call sites use `rpc.*` directly rather than `appData.utils` (apps/conciv routes, composer and pane files, CLI, embed, `extension/src/client-host.ts`, `client/src/chat-connection.ts`, `use-chat-session.ts`, terminal and design extension clients; verified for `draft-storage.ts`, `use-pane-messaging.ts`, `pane-provider.tsx`). Fix: either keep each group's oRPC procedures until PR 20, or move every direct caller of a group in the PR that moves it, with the file list.

**C4. Hub WebSocket attach collides with the engine's upgrade handling.** `serveHono` (`packages/serve/src/serve.ts:52-83`) owns `upgrade`; `servePort` does not expose the server. Specify surfacing, path split for upgrades, and socket drain on close.

**C5. Session scoping and the widget approval bypass have no replacement.** `CONCIV_SESSION_HEADER` plus `runWithSession` (`api/rpc/mount.ts:36-62`) and `widgetCaller(callerOrigin)` (`router.ts:56-63`). Define the session argument, who calls `runWithSession`, the `CONCIV_SESSION_ID` mapping, and what replaces the origin bypass under Devframe auth.

**C6. Plugin discovery and the client/server split are unspecified.** Extensions ship separate `browser` and `import` entries bundled by `@conciv/extension-compiler` via `plugin/src/core/extensions-entry.ts` and `extensions-watch.ts`. Define how the engine finds a `defineConcivPlugin`, how the widget bundles its client half, and the package exports.

**C7. Deleting the tool registry breaks unlisted importers.** `@conciv/extension/registry` is used by `chat/src/code-mode.ts` (code mode stays), `tools/src/builtins/server-tools.ts`, core `app.ts`, `tool-registry.ts`, `runtime/primitives.ts`, `runtime/scope-types.ts` (verified), plus tanstack and design sources that migrate later. Keep a registry type surface for code mode, or list every importer change; add `packages/tools` to the plan.

## 🟡 Major

**C8. Vite DevTools mode is a second topology hidden in PR 1.** Which hub's agent host and trust store, whether chat needs a second login, `conciv:host` in a foreign hub, and a version skew (`@vitejs/devtools@0.8.0` on `devframe@1.2.6`, existing hook at `plugin/src/core/vite.ts:212-254`). Move to its own PR after PR 20; conciv already works as a dock (#649).

**C9. Restart handling contradicts itself.** "Not designed yet" in Open Questions, designed in Components and item 6. Commit to the design and close the question.

**C10. No Risks section; keep it small.** Rename Open Questions to "Risks and open questions"; add one-liners: client-runtime bundle size measured once in PR 1; the local-patch policy if Devframe stalls; measure large payloads (recorder keyframes, captures, design frames) before PRs 7 and 13 and design a fallback only if they fail. Decline a maintenance assessment and exit plan.

**C11. Remove the dual-path double-write.** Publish shared state only in the PR that moves each group (`publish(group)`), so each TanStack Query key has one writer. Decline the lint and precedence rule.

**C12. Code-size claims are unproven and carry the Alternative A rejection.** Give one honest net figure including forwarders, Solid hub UI, second `makeAppData` backend, restart handling, login gate, fault plugin and settings routes.

**C13. Settings: scope and API mismatch.** **[contests decision]** Stages 5 and 8 call PR 19 a separate product feature. Independently of that, the plan mismatches Devframe: there is no "register a settings scope with a zod schema"; `createNodeSettings` gives plain `{global, project}` stores already synced as `devframe:settings:project:conciv` (do not publish a duplicate); the current source is `apps/conciv/src/data/settings.ts`; Plugins toggling, Access revoke API and reset semantics are undefined.

**C14. Terminals-only viewer.** **[contests decision]** Stage 8 argues it turns a transport change into a UI redesign and that Alternative D misses "keep conciv's view on a Devframe stream". Omri decided Terminals is the only viewer on 2026-11-01. If kept, the four moved controls need target files.

**C15. Host coverage.** esbuild and rollup (`@conciv/plugin/esbuild`, `/rollup`) are silently dropped; the widget is hard-wired to `/__conciv/` instead of reading `conciv-api-base`. Rsbuild contradicts its own Non-Goal. "Loopback only" is overstated: state the guarantee per host in the existing table (Next is a forgeable Host check; one-time-code login still protects).

**C16. Engine-offline UX deleted with no replacement.** `packages/client/src/reachability.ts` and `apps/conciv/src/app/reachability.ts` feed TanStack Query's `onlineManager`; feed them from the Devframe connection status instead of deleting.

**C17. Data-layer design gaps.** `publish(group)` key names and shapes; dual-backend `makeAppData` (reproduce `.key()` and oRPC's query-key shape from `client/src/query-utils.ts`); schemas are inline in `oc.input().output()` and need extraction; no-input procedures; error-map to `ConcivError` mapping; `:` naming rule vs `conciv:<group>:<proc>` and `ctx.scope`.

**C18. Terms undefined.** Link Devframe's docs once; define conciv terms the design keeps (harness, code mode, approval gate, result caps, chat mirroring, slots, cards, attachments, connect gate). One name per credential; "devframe" vs "plugin".

**C19. Stale or inconsistent text.** "Step 6", "open decision below", two vs four describes, "a spike proved each piece", "the channel folds into it", unverified "dev servers do not log upgrade URLs".

**C20. Test plumbing gaps.** Core needs `playwright` in devDependencies to reach a Chromium shard (`vitest-config/src/shards.ts:45-64`); the fault plugin needs a named fallback; replacements for `abortRpcCalls`, `observeRpc`, `watchRpcWire`, `rpcCallMark`, `httpRpcRequestUrls`, `watchPushWire`, and unlisted callers (`apps/conciv/test/commands/core-control.ts`, `core-testkit.ts`, `packages/embed/tests/e2e/embed.it.test.ts`, `extension-testkit/src/launch.ts`).

**C21. Unlisted file impacts.** `open-editor.ts` importers and `launchEditor` plumbing; `page-bus.ts` exports used by core runtime; PR 20 misses `extension/src/types.ts`, recorder and whiteboard client files, `cli/src/page.ts`; new subpath exports need `package.json` and `tsdown.config.ts` entries; versions belong in the pnpm `catalog:`; dependency list misses testkits and extension packages.

**C22. Decisions left to the implementer.** try-it (move or drop), `ui-kit-terminal` (only the terminal imports it; also `PUBLIC_PACKAGES`), `packages/try`, which probe build tool, the keyframe size limit, the #649 fix itself, "Delete or Modify" per file.

## 🟢 Nits

Item numbering out of order (41-44 before 30-40); `ConcivError` reads as a class (use a factory plus type); spike wrapper is 110 lines with `{input, output}`; `initHub` needs `base`; `@conciv/it` already a dependency; changesets must name touched public packages; list dev-server versions; Testing section repeats the plan; `service-shiki`/`service-git` have no consumer and lack the `@devframes/` scope; `conciv({devframes: {defaults, add, remove}})` knobs (keep `add`); `/usr/bin/env -u` is POSIX-only; same-origin exposure to app scripts should be stated; `allowedOrigins: false` invariant (moot after C1); #649 fix is unrelated (ship alone); Alternative F template; duplicated alternatives; Components lack headings; extra blank lines; wording nits from both style passes; `*Drafted with EGM*` footer.

## Traceability matrix

| Action                   | Stage 5 | Stage 6        | Stage 7                | Stage 8 | Stage 9                      |
| ------------------------ | ------- | -------------- | ---------------------- | ------- | ---------------------------- |
| C1 agent surface         | M3      |                | B1, N8                 | B1      |                              |
| C2 credentials           |         | M2, M10        | M3, M4, M12, M15       | M2      | B1, M6                       |
| C3 direct callers        |         |                |                        |         | B2                           |
| C4 WebSocket attach      |         |                |                        |         | B3                           |
| C5 session scoping       |         |                |                        |         | B4                           |
| C6 plugin discovery      |         |                |                        |         | B5                           |
| C7 registry importers    |         |                |                        |         | B6                           |
| C8 Vite DevTools mode    | M3      | M9             | M4                     | M3      | M14                          |
| C9 restart contradiction | M7      | M6             | M2                     | N5      |                              |
| C10 risks                | N4      |                | M1, M5                 | M5      |                              |
| C11 double-write         | M5      |                | M6                     | M6      |                              |
| C12 code size            | N7      |                | M8                     | M7      |                              |
| C13 settings             | M4      |                |                        | M8      | M9, M10                      |
| C14 terminal             |         |                |                        | M4      | M20                          |
| C15 hosts                | M1, M2  |                | M3                     | N6      |                              |
| C16 reachability         | M6      |                |                        | N6      | N10                          |
| C17 data layer           | N2      |                |                        |         | M2, M3, M4, M5               |
| C18 terms                |         | M1, M3, M4, M5 | M13                    | N1      |                              |
| C19 stale text           |         | M7, M8         | M9, M10, M11, M14, M15 | N5      | N5                           |
| C20 test plumbing        |         |                | M7                     | N4      | M7, M11, M17                 |
| C21 file impacts         |         |                |                        |         | M12, M13, M14, M15, M16, M18 |
| C22 open decisions       | N5, N6  | N19            | N1                     | N6      | M8, M19, M21, M22            |

Stage finding ids refer to each stage report's own numbering (B = Blocker, M = Major, N = Nit).
