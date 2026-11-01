# Stage 9 Re-audit (cap reached)

Target: `docs/designs/devframe-migration.md`, lines 510-976, after the review fixes. Reviewers: egm-implementation-readiness, egm-codebase-details (fresh contexts). Both verdicts: FAIL, but much narrower. Prior findings: 5 of 6 Blockers resolved, 1 partly; 13 of 22 Majors resolved, 9 partly; none still fully open. The one allowed re-audit is used; what remains is recorded here.

## New Blockers

1. **"No `mcp` option" turns Devframe's MCP route on** (`hub/src/node/initiate.ts:506-513`, verified). `'auto'` mounts `<base>__mcp` with `authorization: false`. WebMCP registers unless `webmcp === false` (`devframe/src/client/rpc.ts:359`). Fix: `mcp: false`, `webmcp: false`; say what plugin iframes do; run the agent-surface test from PR 1.
2. **One value asked to be two.** The widget needs a hub base (page origin) and an API base (engine). `conciv-api-base` is always the engine today; Next uses `window.__CONCIV_API_BASE__`. Define both per host; list `widget-middleware.ts`, `apps/conciv/src/lib/api-base.ts`, `nextjs-widget.ts`.
3. **The engine token reaches the page** (verified: `terminal/src/server.ts:58-60`, `design/src/server.ts:53-57`). `basePath` always carrying `/t/<token>` leaks it through connect commands, xray URLs and `nativeUrl`, and into `~/.conciv/dev-endpoint.json`. Fix: `basePath` stays token-free for browser-facing links; prefixed base only for CLI and agents.
4. **PR 8 replaces the registry while every extension is legacy.** `app.ts:165-171,415` registers legacy tools. Keep the old registry working until extensions move; swap at PR 20. `ToolSignature` fields (`mirrors`, `keywords`, `positional`, `icon`, `label`, `reachable`) need a mapping.
5. **`Kit.hub` has no hub.** `createTestkit` uses `makeApp` plus `serveApp`, not `start()`, so gate, `claimUpgrade` and token are absent; `Kit` has no `engine`. State who owns the plane (it needs `chat` from inside `makeApp`), and how `BootedApp` and `serveApp` expose it.
6. **The gate in PR 1 breaks existing suites.** Kit widget tests, 13 `e2e/*/tests/widget.spec.ts` suites, `boot-server.ts`, and assertions in `core-api.it.test.ts:147-152,463,718-719`, `core.test.ts:683`, `core-chat.it.test.ts:254`, plus direct URLs in `packages/try/test` and `packages/cli/test`.

## Majors

- `Engine` shape (`hub`, `apiBase`, `hub.ready`), hub creation order (`serverSessions`, `serverHarness` are `makeApp` locals).
- try, native and `entry-standalone.tsx` have no hub login path; hub client needs the token from `/t/`.
- Attachment expanders are read server-side (`app.ts:142-153`), but `attachments` were placed only in the client half.
- PR 14 (page) is hard-wired in `app.ts`, `start.ts`, `mount-impl.tsx`; `withBuiltinExtensions` type.
- Item 35 leaves `AnyExtension`, `AnyToolBuilder`, `catalog.ts` templates, `tools/src/extensions-tool.ts`, `apps/conciv/src/extensions/highlight.tsx`, the tanstack example's `deploy-button.tsx`, ping fixtures, docs and skills on `defineExtension`.
- Item 4 names the wrong loader: Vite and `boot.ts` use `loadServerExtensions`; `DedupeResult`, `isExtension`, `StartOpts.extensions`, `composeSystemPrompt` need widening.
- Revocation does not close conciv's own sockets; the wrapper's 401 has no CORS headers, so a widget reads it as offline; `devframe:auth:revoked` UX undefined.
- PR 7 removes the bus that oRPC `page.queries`/`page.reply` still use, and `embed/src/mount-impl.tsx:80-98` consumes it; tab registration undefined.
- Test moves too late: `page.route` helpers go silent when a group moves (`drafts` in PR 4), not at PR 20; `conciv.test.ts` breaks at PR 4.
- Nobody owns the 140 `Kit.rpc` call sites: adapter or rewrite, and in which PR.
- Chat events moving at PR 20 have no server design and touch the chat plane, a Non-Goal.
- `panel.surface` values (`floating` vs `page`), default vs "conciv-only is default", config `surface` precedence.
- `conciv({devframes: {add}})` has no field in `ConcivConfig`.
- Plugin toggle storage cannot be read before `initHub`; `publish` value vs `includeHidden`; measurements have no pass/fail threshold.
- Tests missing for the Vite loopback guard, CLI token lookup, log stripping, reachability, hidden docks.
- `accessToken` gate semantics on open paths; `notifyClient` must stay; `env` forwarded to `app.fetch`; `harness-init/src/claude/endpoint.ts` writes `mcp-endpoint.json`.
- PR 20 leftovers: `api/rpc/chat.ts`, `sessions.ts`, `api/push.ts`, `@orpc/*` in manifests and catalog, `e2e/nextjs/tests/packed-closure.spec.ts`.

## Nits

`panel.$sessionId.$view.tsx:43` missing from item 24; core-chat case count (7 `it(` sites vs 11, confirm); stale "MCP path changes" line; fallback needs a `Page`; `DevToolsContext.register` returns `void`; diagram lists `shiki` and `git`; `Kit.rpc` wording; `hub-internals` now also used for listing and revoking; `apps/conciv` exports for `devframe-link`.
