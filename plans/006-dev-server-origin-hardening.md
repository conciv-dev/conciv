# Plan 006: Design — harden the dev server against cross-origin drive-by

> **This is a DESIGN / INVESTIGATE plan, not a code change.** Its product is a written design doc and a
> follow-up implementation plan — not edits to `packages/core`. Do NOT implement a CORS lockdown from
> this plan; the wrong fix breaks the widget. A capable model (or the maintainer) should do this
> analysis; a cheap executor should NOT be pointed at this to "just do it."
>
> **Drift check (run first)**: `git diff --stat 2446924..HEAD -- packages/core/src/api/cors.ts packages/core/src/widget-tags.ts packages/widget/src/transport.ts`

## Status

- **Priority**: P1 (investigate)
- **Effort**: M (design + spike)
- **Risk**: HIGH if implemented carelessly (can break the widget→core channel)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2446924`, 2026-06-16

## Why this matters

The core dev server exposes powerful routes — `POST /api/chat` (drives the agent, which can edit files
with `acceptEdits` and run allow-listed Bash), `POST /api/editor/open` (opens arbitrary paths),
`DELETE` session routes, `POST /api/chat/permission-decision` — with **no authentication** and a CORS
policy that reflects any origin with credentials:

```ts
// packages/core/src/api/cors.ts (lines 5-10)
const corsOptions: CorsOptions = {
  origin: () => true,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['content-type', CONCIV_SESSION_HEADER],
}
```

The server binds `127.0.0.1`, so it's local-only — but any web page the developer visits while the dev
server runs can issue cross-origin requests to `http://127.0.0.1:<port>/api/*`. CORS governs _response
readability_, not the _side effect_: a cross-origin `POST /api/chat` executes server-side regardless.
The port is the only barrier, and ports are scannable. So a malicious page could drive the local agent.

This is the classic "malicious site attacks localhost dev server" class. The permissive CORS is
partly **by design** — the widget runs on the _app's_ origin (injected into the user's page) and must
reach core on `127.0.0.1`, which is cross-origin; hence reflect-origin + credentials. So the fix is not
"lock to one origin" (the app origin varies); it needs a token or strict request-authenticity check
that still lets the legitimate widget through. That tradeoff is why this is a design task, not a
one-line change.

## Current state (facts for the design)

- CORS config: `packages/core/src/api/cors.ts` (excerpt above). SSE routes carry CORS headers
  separately via `corsHeadersFor` / `sseHeaders` (`packages/core/src/api/sse.ts`).
- The widget already sends a custom header on session-scoped requests: `CONCIV_SESSION_HEADER`
  (`conciv-session-id`), added by the widget's transport/session client
  (`packages/widget/src/transport.ts`, `session-client.ts`). A custom header already forces a CORS
  preflight — a useful property.
- The widget learns the API base from an injected meta tag: `packages/core/src/widget-tags.ts` injects
  `<meta name="pw-api-base" content="http://127.0.0.1:<port>">`. This is the natural seam to also inject
  a per-boot secret.
- Routes of concern: `packages/core/src/api/chat/turn.ts` (`/api/chat`), `chat/session.ts`
  (session GET/DELETE), `chat/permission.ts` (`/api/chat/permission-decision`),
  `api/editor/editor.ts` (`/api/editor/open`), `api/mcp/mcp.ts`. The MCP route is hit by the spawned
  CLI (localhost, server-to-server), so any auth scheme must not break that path.
- No auth/token exists anywhere (`grep -rniE "authorization|bearer|token|secret" packages/core/src`
  finds only token-_usage_ accounting, not auth).

## Scope

**In scope** (produce these — documents, not code):

- `plans/design/006-dev-server-origin-hardening.md` (create) — the design doc described below.
- A follow-up implementation plan file `plans/007-<slug>.md` capturing the chosen approach, IF the
  design lands on a concrete recommendation. (Add its row to `plans/README.md`.)

**Out of scope**:

- Any change to `packages/core/**` or `packages/widget/**` source. This plan does not modify runtime
  code. (The follow-up plan 007 will.)

## What to investigate / decide

Write the design doc covering:

1. **Threat model, scoped honestly.** Local dev tool, `127.0.0.1`, dynamic port. Attacker = a web page
   the dev visits while the server runs. What they can/can't do today (drive agent, open files, delete
   sessions; cannot read responses cross-origin without CORS — but side effects land). Note the
   permission gate still protects _risky_ Bash (read-only auto-allows).

2. **Options, with tradeoffs:**
   - **(A) Per-boot capability token.** Core mints a random token at boot, injects it via the existing
     `widget-tags.ts` meta seam, and requires it (header) on state-changing routes. Same-origin-policy
     stops a cross-origin attacker from reading the token, so blind drive-by fails. _Tension:_ the
     token is visible to any JS on the app's page (the app is trusted; a malicious 3rd-party script
     already on the app page is a different threat). _Tension:_ the spawned CLI hits `/api/mcp` — decide
     whether MCP needs the token (it's server-to-server on localhost) or stays exempt.
   - **(B) Origin/Referer allow-list derived from the configured preview origin(s).** Reject
     state-changing requests whose `Origin` isn't the app origin core was configured for. _Tension:_
     the app origin must be known to core (is it? check `config.ts` / plugin wiring) and dev setups with
     multiple origins.
   - **(C) Require the existing custom header on all mutating routes** (forces preflight; a cross-origin
     attacker can still send it, so this alone is weak) — evaluate as a partial measure only.
   - Combinations (A)+(B).

3. **Recommendation** with rationale, and the **blast radius** of implementing it (which routes, the
   widget transport, the meta injection, the MCP exemption, tests to add).

4. **Open questions** the maintainer must answer (e.g. acceptable threat model floor, whether to also
   gate `GET` reads, MCP token handling).

## Done criteria

- [ ] `plans/design/006-dev-server-origin-hardening.md` exists and covers: threat model, options A–C
      with tradeoffs, a recommendation, blast radius, and open questions.
- [ ] If a concrete approach is recommended, `plans/007-<slug>.md` exists as an implementation plan
      (template-conformant) and is listed in `plans/README.md`.
- [ ] No `packages/**` source files modified (`git status --porcelain` shows only docs under `plans/`).
- [ ] `plans/README.md` row for 006 updated.

## STOP conditions

- The CORS config or the widget's header/transport no longer matches the excerpts (drift).
- You find an existing auth mechanism (then this finding is partially addressed — report what exists).
- The design can't reach a recommendation without a maintainer decision — that's fine: deliver the doc
  with the decision framed as an open question and stop.

## Maintenance notes

- Revisit if the server ever binds beyond `127.0.0.1` (the threat model changes materially).
- Whatever scheme is chosen must keep the legitimate widget→core channel working from the app's origin
  and must not break the spawned CLI's `/api/mcp` calls.
