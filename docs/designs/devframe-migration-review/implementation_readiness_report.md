# Stage 9: Implementation Readiness Test

Target: `docs/designs/devframe-migration.md`, DetailedRange lines 428-853. Reviewers (fresh contexts, no GoldfishContext): egm-implementation-readiness and egm-codebase-details (implementation-readiness-standard), egm-style (persona rules). All three completed. Verdict from both standard reviewers: FAIL (Zero-Decision Rule not met).

Orchestrator spot checks confirmed the top blockers against the code: `start.ts:30,157,168` (accessToken is an optional UUID used as a `/t/<token>` path prefix, set only by `packages/try/src/connect.ts:66`); direct `rpc.drafts.*` / `rpc.sessions.*` calls in `apps/conciv/src/pane/draft-storage.ts:49-61`, `use-pane-messaging.ts:60`, `app/pane-provider.tsx:27`; `@conciv/extension/registry` imported by `packages/chat/src/code-mode.ts`, `packages/tools/src/builtins/server-tools.ts`, `packages/core/src/{app.ts,tool-registry.ts,runtime/primitives.ts,runtime/scope-types.ts}`.

Totals after merging duplicates: 6 Blockers, 22 Major, 20 Nit.

## Blockers

1. **The "pairing token" does not exist on the normal dev path** (readiness B1, codebase B2; items 7, 8, 9, 33, 34). The only token is optional `StartOpts.accessToken`, a URL prefix, set only by `packages/try`. Vite, Next and webpack boots, the CLI and MCP children send no token; MCP is written as `${base}/api/mcp` with no auth (`start.ts:208`). PR 1's `/api/*` middleware would lock them out. Define who creates the token, where it persists, how the CLI and harness children read it, which header the middleware reads, how the widget's oRPC transport attaches the Devframe-trusted token during the dual-path period, and how `/__conciv/` relates to the `/t/<token>` mount.
2. **Removing a group's oRPC procedures in PRs 2-9 breaks direct callers** (codebase B1; items 15, 24, 25). Direct `rpc.*` calls outside `appData.utils`: apps/conciv (`routes/panel.$sessionId.tsx`, `quick.tsx`, `__root.tsx`, `panel.latest.tsx`, `composer/session-selector.tsx`, `model-selector.tsx`, `app/pane-provider.tsx`, `pane/draft-storage.ts`, `pane/use-pane-messaging.ts`), CLI (`request.ts`, `tool-group.ts`, `page.ts`, `open.ts`), embed (`navigation-storage.ts`, `mount-impl.tsx`), `extension/src/client-host.ts`, `client/src/chat-connection.ts`, `use-chat-session.ts`, `extensions/terminal/src/client/terminal-actions.tsx`, `extensions/design/src/xray/data.ts`. Several appear in no PR. "Components do not change during the migration" is false.
3. **`hub.attach(server)` collides with existing WebSocket upgrade handling** (readiness B2; item 9). `serveHono` (`packages/serve/src/serve.ts:52-83`) owns `upgrade` via `@hono/node-server` with `websocket: {server: wss}`; `servePort` does not expose `server`. Specify how the server is surfaced, how upgrade paths are split, and whether `closeLiveSockets(wss)` drains hub sockets.
4. **Session scoping and the widget approval bypass have no replacement** (readiness B3, codebase M2; item 24). Today `CONCIV_SESSION_HEADER` plus `runWithSession` (`api/rpc/mount.ts:36-62`) and `widgetCaller(callerOrigin)` (`router.ts:56-63`). Define the session argument, who calls `runWithSession`, how `CONCIV_SESSION_ID` maps, and what replaces the origin-based bypass.
5. **Plugin discovery and the server/client split are unspecified** (readiness B4; items 5, 27, 28). Extensions ship separate `browser` and `import` entries and are bundled by `@conciv/extension-compiler` via `plugin/src/core/extensions-entry.ts` and `extensions-watch.ts`. `src/devframe.ts` has no export; engine discovery and widget bundling of the client half are undefined.
6. **Deleting the tool registry in PR 8 breaks unlisted importers** (codebase B3). `@conciv/extension/registry` is used by `chat/src/code-mode.ts` (code mode stays), `tools/src/builtins/server-tools.ts`, core `app.ts`, `tool-registry.ts`, `runtime/primitives.ts`, `runtime/scope-types.ts`, tanstack and design sources (migrating later), and tests. The `./registry` export and tsdown entry must change; `packages/tools` is not in the plan.

## Major

1. **Types missing** (readiness M5; items 3, 5). Reference `ServerApi`/`ServerSessions`/`ServerHarness` (`extension/src/types.ts:100-110`); per-extension `config` (`configSchema`) and `basePath` dropped without comment.
2. **`:` naming rule contradicts `conciv:<group>:<proc>`** (readiness M6, codebase M3; items 4, 24). Devframe already throws DF0034 for `:` in scoped names (`devframe/src/node/scope.ts:12`); say whether functions use `ctx.scope('conciv')`.
3. **Schema reuse is not mechanical** (readiness M7, codebase M2). Schemas are inline in `oc.input(...).output(...)` (`contract.ts:105-201`); several procedures have no input; error maps (`notFound`, `noBundler`, `registryCallErrors`, `UNKNOWN_MODEL`, `UNKNOWN_REQUEST`) need a `ConcivError` mapping; decide new per-group files vs `router.ts`.
4. **`publish(group)` and shared state undefined** (readiness M8). Key names, value shapes, which procedures are mutations, and the mapping to TanStack Query keys.
5. **Dual-backend `makeAppData` undesigned** (readiness M9, codebase M1). `appData.utils` comes from `packages/client/src/query-utils.ts` (oRPC `createTanstackQueryUtils`), not listed in PR 1; the second backend must reproduce `.key()` (`app-data.ts:14`, `pane/refresh-coordinator.ts:25-27`) and oRPC's query-key shape.
6. **MCP location and post-removal auth undecided** (readiness M10; PR 8, item 33). Decide `/api/mcp` vs Devframe's route; item 33 leaves `/api/chat`, `/api/mcp` and native pages without a browser-login gate.
7. **Core browser file will not run on a Chromium shard** (readiness M11, codebase M9; item 21). `packages/vitest-config/src/shards.ts:45-64` routes only packages with `playwright`/`@playwright/*`/`@vitest/browser*`; add `playwright` (`catalog:`) to core devDependencies; the `core.browser.it.test.ts` name suggests Vitest browser mode though the checks launch Playwright from Node.
8. **#649 fix describes the symptom, not the change** (readiness M12, codebase M14, style M3; item 17).
9. **Plugins and Access settings behavior undefined** (readiness M13; item 42). Toggling a plugin fixed at `initHub`; source of the list (mockup lists `plugin-a11y`, not pinned); config vs store precedence; "Devframe's revoke" names no API; "agent tokens" no source; reset actions unspecified.
10. **Settings source not named; settings API mismatch** (readiness M14, codebase M11; items 41, 43). Current source is `apps/conciv/src/data/settings.ts` (`parseConcivSettings`: modal, launcher, surface, transport). Devframe has no "register a settings scope with a zod schema"; `createNodeSettings` returns plain `{global, project}` stores already synced as `devframe:settings:project:conciv`; do not publish a duplicate `conciv:settings`.
11. **Fault-plugin spike gates PR 1** (readiness M15). Resolve before execution or name the fallback.
12. **Versions pinned per manifest instead of `catalog:`** (codebase M4; items 1, 2). Also missing from #2: harness-testkit, extension-testkit and every extension package.
13. **New subpath exports need build config** (codebase M5; items 3, 13, 18-20). `extension/package.json` exports and `tsdown.config.ts`; `plugin/tsdown.config.ts` and `@rsbuild/core` types; testkit subpath entries, and removals in #37.
14. **Existing Vite DevTools code and version skew ignored** (codebase M6; item 10). `plugin/src/core/vite.ts:212-254` already has `devtools.setup(context)`, `DevToolsContext`, `docked` detection and a `custom-render` dock; `@vitejs/devtools@0.8.0` runs on `devframe@1.2.6` (`pnpm-lock.yaml:13138,26486`), so `createEmbedded` from 1.3.0 is cross-version.
15. **Deleting `open-editor.ts` breaks unlisted code** (codebase M7; PR 6). `plugin/src/core/boot.ts:5,31`, `vite.ts:13,139`, `StartOpts.launchEditor` and `makeEditorOpener` (`core/src/start.ts:25,144-148`), `try/src/connect.ts:63`, `extension-testkit/src/boot-server.ts:24`, the `launch-editor` dependency and tsdown external.
16. **`page-bus.ts` cannot simply be deleted** (codebase M8; PR 7). It exports `makeJournal`, `Journal`, `ChangeEntry`, `CaptureSink`, `PageEnv`, `PageAnswer` used by `runtime/core-runtime.ts`, `runtime/scope-types.ts`, `runtime/primitives.ts`, `core/src/tool-registry.ts`.
17. **Replacement test helpers cannot match the old shapes; callers missing** (codebase M10; items 19, 37). Old helpers take a Playwright `Page`; no replacement for `abortRpcCalls`, `observeRpc`/`rpcObserverFor`, `watchRpcWire`, `rpcCallMark`, `httpRpcRequestUrls`, `watchPushWire`; unlisted callers `apps/conciv/test/commands/core-control.ts`, `core-testkit.ts`, `packages/embed/tests/e2e/embed.it.test.ts`, `extension-testkit/src/launch.ts`, `extension-testkit/test/extension-testkit.test.ts`.
18. **PR 20 file lists incomplete** (codebase M12). Unlisted `@orpc/*` importers: `extension/src/types.ts`, `recorder/src/client/recording-card.tsx`, `panel-view.tsx`, `whiteboard/src/client/whiteboard-collection.ts`; #34 omits `cli/src/page.ts`.
19. **Decisions left to the implementer** (codebase M13, style M2, readiness N19/N21; PRs 10, 18). try-it "move or drop" (no `src/server.ts`, so item 27 does not apply); `ui-kit-terminal` is imported only by `extensions/terminal` (delete now, and edit `PUBLIC_PACKAGES` in `publish/src/guards.ts:71`); `packages/try` and its `accessToken` boot path unaddressed.
20. **Four terminal features move with no target files** (style M6; PR 10). Model picker, view lock, element paste, open in OS terminal.
21. **Unnamed choices** (style M7, M8; items 20, recorder). "One build tool, not the spike's two" (which?); "`pull` keyframe size checked against the MCP route" (which limit, what on failure?).
22. **"Delete or Modify" without per-file marks** (style M5; items 30-32), and the settings check cites "the mockup" without a path (style M4; item 44).

## Nit

1. Item numbering out of order: PR 19 uses 41-44, PR 20 uses 30-40; item 40 (changesets, every PR) sits under PR 20 (all three).
2. `ConcivError(code, message, data)` reads as a class; the spike uses a `concivError()` factory plus a type (codebase).
3. Spike `devframe-function.ts` is 110 lines and uses `{input, output}` with one argument, not `{args, returns}` per argument; note the change (codebase).
4. `initHub({auth: false})` omits required `base` (`initiate.ts:162`) (codebase).
5. "Four describes" are two `describe.each` blocks; context says two (codebase, style).
6. `@conciv/it` is already a dependency of the Next example; only `dependenciesMeta.injected` changes (codebase).
7. Changesets must name each touched public package (`@conciv/contract`, `client`, `cli`, `extension` are in `PUBLIC_PACKAGES`) (codebase, style).
8. Dev-server devDependency versions not listed ("the versions the spike pinned") (readiness, style).
9. `settings-schemas.ts` conditional (readiness, style).
10. `apps/conciv/src/app/reachability.ts` not mentioned beside the client one (readiness).
11. `service-shiki`/`service-git` missing the `@devframes/` scope (style).
12. "The window" undefined; the comment request conflicts with "no comments" (style).
13. Bare filenames despite "paths relative to the repo root" (style).
14. "`<group>.ts` or `router.ts`" has no rule (style).
15. "Four `agent` functions" for ios not named (style).
16. "Replacing any current local source" vague (style).
17. "Reset all asks twice" ambiguous (style).
18. Informal wording: "no hand CSS", "start no conciv hub", "go", "the 100 ms trust write", an agent instruction inside a scope field (style).
19. `pnpm turbo run` vs `turbo run` (style).
20. "In the user's browser" ambiguous; "_Drafted with EGM_" footer (style).
