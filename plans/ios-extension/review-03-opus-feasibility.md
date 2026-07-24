# Spec review 03 — opus, implementation-feasibility lens (2026-07-24)

Verdict: needs fixes (not redesign). Review-01 blocker fixes independently re-verified against code — all hold.

## MAJOR

1. Byte-equal cross-language golden encode (02 §M11.4, 07 §4, 08 AC3) has NO canonicalization mechanism specified. JSON.stringify = insertion order; Swift JSONEncoder = unordered or .sortedKeys. No named canonical stringify for TS, no .sortedKeys mandate, no float-vs-int rule. AC3 un-passable until an implementer invents the whole scheme.
2. The "generated exhaustive fixtures" generator (02 §M11.2) is unspecified engineering behind a checkbox: walking arbitrary zod schemas to synthesize valid values + bounding the optional-combination explosion is substantial work with zero guidance, and it gates swift test + the CI drift check, so it cannot be deferred. Single largest hidden cost in the plan.

## MINOR

3. `window.__CONCIV_GRAB_PROVIDER__` self-registration needs a top-level import side-effect that survives tree-shaking; neither the side-effect contract nor package.json `sideEffects` is called out. Core-served delivery (#2) silently depends on it.
4. 05 §2's "if !connected() navigate to connect/panel route" cannot fire on the native path: pre-mount apiBase → bootNormal → `connected: () => true` hardwired (mount-impl.tsx:67); the connect route exists only in bootConnect's memory history. Implementer will guess.
5. Token path-prefix rationale is wrong: /t/<token> is served by packages/try/src/cli.ts (separate proxy), NOT core (`composeRoutes` serves /rpc at root). Scoping RPC under /t/ is new core work, not "parity". (Deferred to M5, so not fatal.)
6. Native embed entry has no source-file location; only existing entry template lives under test/fixtures (wrong for production). Implementer must invent path + how the artifact joins embed's files/build.
7. 08 §M14 rationale undercut: whiteboard/test-runner are also plugin-wired yet ARE in fallow publicPackages — plugin-wiring isn't the discriminator. Empirical rule (run fallow, add if flagged) still safe.
   Trivial: 00-overview cites host-context.ts:29 for insert/attach; actual 25/26.

## Weakest file

02-bridge-protocol.md — strongest guarantees, hardest unspecified mechanics (generator + canonicalization).
