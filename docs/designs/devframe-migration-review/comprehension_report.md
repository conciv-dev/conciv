# Stage 6: Comprehension Test

Target: `docs/designs/devframe-migration.md`. FeatureRange 1-427, DetailedRange 428-853. Reviewer: egm-comprehension (fresh context, no GoldfishContext, no standard).

**What this proposes**

conciv will drop the communication code it maintains between its engine and its widget. That code is an oRPC contract and its clients, a push channel, a tool registry, MCP listing and calling, and per-extension routers and websocket routes. In its place conciv adopts the Devframe library (1.3.0). The engine runs one Devframe hub under `/__conciv/`. Each host dev server (Vite, Next, webpack-dev-server, Rspack, and later Rsbuild) serves that hub on the page's own origin, to loopback clients only, so plugin iframes reuse the browser's stored login without a token. Every extension becomes a Devframe plugin through a thin conciv layer: `defineConcivPlugin`, `defineConcivFunction` (adds zod parsing, coded errors and return types), a `conciv:host` service, a Node client and restart handling. Agent tools come from function metadata, and conciv keeps only code mode and the approval gate on top. The migration runs over 20 PRs with oRPC and Devframe working side by side: foundation first, then core procedure groups, then extensions, then a settings page, then removal of oRPC. Tests move with the code they cover, and core's test files are rearranged so a browser test file fits.

**How the existing system works, per this document**

conciv has a Node engine (Hono) running next to the user's dev server and a Solid widget injected into the page. They talk over an oRPC contract of 40 procedures, with TanStack Query wiring, plus a push channel for server-to-page calls. Extensions are built with `defineExtension`, which has its own server routers, Hono routes, websockets, views and tools. A hand-written tool registry feeds an MCP endpoint that adds code mode and approvals. Chat runs on `@tanstack/ai`. Inside Vite DevTools, conciv appears as a dock but still runs its own server and login. Tests use two testkits built around oRPC, including `page.route` interception of `/rpc/*`.

Both ranges could be paraphrased: no paraphrase Blocker. 10 Major, 11 Nit.

## Findings

1. 🟡 Major. Lines 16-19, 117-125, 167-181, 196-199, 211-213. Devframe vocabulary is never defined: hub, a devframe versus a plugin versus `DevframeDefinition`; dock, `action` dock, iframe dock, `when: 'false'`, `clientAssets`; page-script channel function, streaming channel, shared state, trust store, agent host, browser agent bridge. Add a short glossary or links.
2. 🟡 Major. Lines 98, 139, 184-186, 232, 255 versus 503. "Pairing token" and "engine bearer" read as two credentials; only line 503 shows they are the same. Define it once in Security: what it is, where it comes from, who holds it.
3. 🟡 Major. Lines 45, 80-81, 125, 214. Code mode, approval gate, result caps and chat mirroring are kept but never explained; `execute_typescript` and `discover_tools` listed without saying what they do or how they relate to the MCP endpoint and agent host.
4. 🟡 Major. Lines 135, 140, 156, 184, 255. "Harness", "harness children", "TTY command, connect plan" are never defined.
5. 🟡 Major. Lines 168-169, 181, 476-477, 686. Panel slots (`Component`), chat cards, attachments, approval policy and "connect gate" justify the `conciv` field but are not described.
6. 🟡 Major. Lines 95-97 versus 187-191 and 483-486. Restart handling is "not designed yet" in Open Questions but specified in Components and item 6.
7. 🟡 Major. Line 276. "When the push channel moves (step 6)": the plan numbers PRs; the push channel's page half moves in PR 7.
8. 🟡 Major. Line 347 versus line 610. "Two describes" in CI versus "the four describes" in item 22.
9. 🟡 Major. Lines 114-124, 513, 518-521. Whether the engine runs inside the Vite process (hub middleware mounted on Vite) or out of process (Next, wds, Rspack forward to it) is never stated.
10. 🟡 Major. Lines 231-232 versus 779-783. PR 20 removes the `/api/*` login middleware; what authenticates `/api/chat` and native pages afterwards is not said. Possible security gap.
11. 🟢 Nit. Line 77: "TanStack AI adoption lane" undefined.
12. 🟢 Nit. Lines 40, 59, 84, 201, 571: #648, #649, #572 are bare numbers; #572 not described.
13. 🟢 Nit. Lines 76, 244, 771: "chat plane", "page plane" undefined.
14. 🟢 Nit. Lines 430, 621, 843: "fallow" not introduced.
15. 🟢 Nit. Line 456: `nativeUrl` in `ConcivHost` but not in the Components list, never explained.
16. 🟢 Nit. Lines 475-478: `defineConcivPlugin` "registers the `conciv-view` dock type for `views`" but has no `views` input.
17. 🟢 Nit. Line 604: PR 1 browser checks include "a page tool over MCP" though page tools move in PR 7; which tool, or a probe fixture?
18. 🟢 Nit. Lines 619-620: `@conciv/it` and why `dependenciesMeta.injected` keeps the engine out of Next's bundle are unexplained.
19. 🟢 Nit. Line 718: try-it "move or drop" with no rule; lines 52-53 exclude it from published extensions, line 226 includes it.
20. 🟢 Nit. Lines 722-756: PR 19 uses items 41-44, PR 20 uses 30-40.
21. 🟢 Nit. Lines 530, 713, 733, 742: `NEXT_PUBLIC_CONCIV_PORT`, "xray", "router-core intent skills", "agent tokens" used once without explanation.

Verdict: followable overall; assumes Devframe vocabulary and conciv concepts; four internal inconsistencies (findings 6, 7, 8, 10).
