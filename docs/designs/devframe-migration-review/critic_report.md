# Stage 7: Critic Review

Target: `docs/designs/devframe-migration.md`, FeatureRange lines 1-427. Reviewers (fresh contexts, no GoldfishContext): egm-design (feature-spec-standard), egm-structural (feature-spec-standard), egm-style (persona rules). All three completed.

Totals after merging duplicates: 1 Blocker, 15 Major, 21 Nit.

## Blocker

**B1. Agent-facing channels can bypass the approval gate** (design; lines 18-19, 55-58, 80-81, 124-125, 139-140, 211-216, 273). Tools become Devframe `agent` functions; Devframe generates an MCP route and WebMCP from that metadata, and Vite DevTools' hub has its own agent host. The approval gate, code mode and result caps live only in conciv's MCP endpoint. The doc does not list every agent-reachable entry point (Devframe MCP route, WebMCP, Vite DevTools MCP, direct RPC) or say how each enforces approval; an `approval: 'ask'` tool (terminal injection, code execution) could be reached ungated. Where `/api/mcp` lives is undecided (line 273). Fix: enumerate entry points; disable each or enforce the gate inside `defineConcivFunction` so every path passes through it.

## Major

1. **No Risks & Mitigations section** (design, structural; whole range). Risks are scattered across Open Questions, Security and "accepted" notes; some have no mitigation (large payloads, Next Host forgery, stale shared state on restart). Unassessed: Devframe maturity and maintenance, widget bundle-size impact of the Devframe client runtime, ongoing local-patch maintenance (line 89), exit plan if Devframe stalls after oRPC is deleted in PR 20.
2. **Restart handling both "not designed" and designed** (design, structural; lines 95-97 vs 187-191). Resolve; restarts are routine in dev, so this is core behavior.
3. **"Loopback only" overstated** (design; lines 62, 253 vs 147-148). Next's guard is a forgeable Host check and `next dev` listens on all interfaces; Vite DevTools mode has no loopback guard. State the guarantee per host, say why Next cannot do a socket check, and what still protects a forged-Host LAN client (one-time-code login).
4. **Login across processes in Vite DevTools mode unspecified** (design; lines 63-64, 120-122, 147, 231-232). Chat stays on the engine; the `/api/*` middleware accepts "a Devframe-trusted token", but in this mode the trust store belongs to Vite DevTools' hub. How the engine validates it, whether chat needs a second login, and whether `conciv:host` is provided in every topology are not stated.
5. **Large-payload slowdown noted, not mitigated** (design; lines 103-105, 159-162). Add a measurement before the captures, page and recorder PRs, a regression budget, and a fallback (streams or binary channels).
6. **Dual-path consistency has no enforcement** (design; lines 231-238). No inventory, lint or test guarantees every mutation also refreshes shared state; no precedence rule when a refetch and a shared-state write race on one TanStack Query key.
7. **Fault-helper plugin rests on an unverified premise with no fallback** (design; lines 106-107, 275, 302-310, 417-424). Run the spike check before approval or keep one rejected option as a named fallback.
8. **Code-size numbers do not add up** (design, style; lines 32-36, 67-69, 159, 364-366). Problem counts about 4,200 lines (3,000 + 930 + 270); Goals says about 3,000 deleted with no net figure. "About 140 lines" omits `conciv:host`, `defineConcivPlugin`, host forwarders, dual-backend `makeAppData`, the Solid hub UI, login middleware and the fault plugin, and `defineConcivFunction` alone is about 110. Restart handling has no size; "far less" has no figure. The Alternative A rejection rests on these.
9. **Overclaim: "A spike ... proved each piece"** (style; lines 23-24). Rsbuild is source-only, the fault plugin needs a check, the custom auth handler is unproven.
10. **Stale cross-reference "open decision below"** (structural, style; line 275). The decision is recorded at line 302 and in Alternative G.
11. **Unresolved "step 6"** (structural, style; line 276). The plan numbers PRs; name the PR or group.
12. **One credential, six names** (style; lines 18, 59, 61, 98, 101-102, 139, 185, 232, 254-255, 295, 299, 400). Browser login, login token, engine bearer, pairing token, Devframe-trusted token, one-time code. Readers cannot tell how many credentials exist. Add a terms list, one term each.
13. **"devframe" vs "plugin" vs "Devframe"** (style; lines 22, 53, 118, 138, 147, 197). Define a devframe as a `DevframeDefinition` once and use one term.
14. **"The channel folds into it"** (style; lines 243-244). Say what happens: push channel deleted, chat events move to the `@tanstack/ai` socket.
15. **Unverified security claim** (style, design; lines 101-102, 256-257). "Dev servers in scope do not log upgrade URLs" has no evidence and ignores the engine's own Hono logging, reverse proxies and tunnels. Verify, or strip the token from engine logs.

## Nit

1. Extension list differs: Goals 8 vs migration 9 with `try-it` (structural, style; lines 52-53 vs 226, 274).
2. Alternative F "Not rejected for good: deferred" breaks the alternatives template (structural, style; lines 414-415).
3. Wire-level fault-helper rejection written twice (Testing and Alternative G); test-file-budget alternatives only inline (structural; lines 302-310, 341-343, 417-424).
4. Components use bold numbered lead-ins instead of H4 headings (structural; lines 134, 142, 152, 193, 211).
5. Three blank lines before Alternatives (structural, style; lines 350-352).
6. Bearer-in-URL risk described differently in two places (structural; lines 101-102 vs 256-257).
7. Same-origin exposure: every script on the app origin, including third-party or XSS, can use the stored Devframe login to drive terminals or code execution; say whether this is no worse than today (design; lines 128-130, 254-256).
8. `allowedOrigins: false` disables the MCP Origin check; state the invariant that the pairing token never reaches a browser (design; lines 139-140).
9. `/usr/bin/env -u` assumes POSIX; state the OS range (design; lines 248-249).
10. "conciv owns code that is not its product" is rhetorical (style; line 28).
11. "we" appears once (style; line 37).
12. "thin conciv layer" is subjective (style; line 44).
13. "Never broken in between" is absolute and unmeasured; reference the per-PR green rule (style; line 65).
14. "Tests prove behavior" should be "verify" (style; line 70).
15. "Decided for now" hedges inside Open Questions (style; lines 99, 186).
16. Guessed cause of slowdown stated beside a measurement (style; line 103).
17. "Devframe's two type views" undefined (style; line 165).
18. "that is accepted" has no owner (style; lines 190-191).
19. "Highest-leverage swap" is jargon (style; line 271).
20. "Lane", "chat plane" undefined (style; lines 76-77, 341).
21. Imprecise wording: "breaks the last three" (lines 331-332), "describes" and "tens of seconds" (347-349), "smallest change" (370), "match exactly" (380) (style).
