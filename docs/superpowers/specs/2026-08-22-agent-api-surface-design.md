# Agent API surface: every procedure is a tool

Date: 2026-08-22 (revision 3, after two adversarial review rounds)
Status: approved direction, blocked behind `feat/session-scope-enforcement`

## Goal

Every API conciv has is one kind of thing: an oRPC procedure. The same procedure serves the
widget over RPC and the agent through the code-mode catalog, is approval-gated by one
enforcement layer, and is safe for any caller because authority is derived server-side, never
accepted from input. Adding a first-party feature (a new procedure with a one-line summary)
requires zero further work to make it agent-visible: reads marked read-only are callable
freely, everything else pauses for user approval, and exposure is the default.

## Problem today

Three authoring dialects for one semantic thing:

1. **Core contract** (`packages/contract/src/contract.ts`): bare `oc`, no meta. 40 procedures,
   11 namespaces. Invisible to the agent.
2. **Extension routers** (`ext.<slug>` via `rpc-mount.ts`): whiteboard sync CRUD (~26),
   recorder (11), terminal (5). Bare `os`, no meta, invisible to the agent, and written as
   trusted-client APIs: they accept authority-bearing input (author, room, timestamps, raw
   rows) and rely on the widget being honest.
3. **Tool registry** (`defineTool`): ~103 tools, compiled to oRPC internally, full meta,
   agent-visible via the code-mode sandbox.

Duplicated features across dialects (whiteboard comment tools vs comments router; recorder
tools vs recorder router; two tanstack tool families). Approval enforced in three unrelated
places (`gate.ts`, `gatedToolRun`, `approveAskGatedCall`). Assist tools ride a fourth path
with hardcoded, partly wrong metadata.

## Design

### One unit: a metered oRPC procedure

A shared `AgentMeta` type lives in `@conciv/contract`:

- `summary` — required for every catalog-included procedure, and doubles as the agent-facing
  documentation (`external_catalog` serves it with the typed signature). Resolution order:
  `agent: false` is resolved FIRST; only included procedures then require a summary, and a
  missing one fails catalog construction with an error naming the procedure (dev-boot
  feedback, never a silent gap). All other meta is optional: authoring meta is partial and the
  bridge resolves it conservatively into a total `ResolvedAgentPolicy`.
- `readonly: true` — no state mutation AND no host/user-visible effect.
- `disclosure: 'sensitive'` — a read that exposes data an agent must not pull silently
  (recorder replay, query caches, cross-session drafts); ask-gated despite being a read.
- `agent: false` — excluded from the catalog. Rare, and usually a smell. The poison startup
  assertion (below) is independent of catalog inclusion.
- `stream: true` — explicit marker for event-iterator procedures; collector wrapping is driven
  by meta, never inferred from schema internals.
- Tool-layer extras (icon, label, capture, positional, mirrors, renderer) stay in
  `defineTool`, which becomes sugar producing the same unit.

Everything first-party builds on one platform base carrying the meta type and the shared gate
error set (deny, timeout, cycle, rate-limit, invalid collector bounds — declared once on the
base so every procedure's error contract includes them without per-procedure boilerplate).

### Principal, not transport: who is calling

Caller identity is a branded, unexported `Principal` constructed ONLY by authenticated
boundary adapters — a plain `{plane: 'human'}` object is not proof, and in-process code
cannot forge one (the constructor is module-private; in-process router clients must go
through a boundary adapter or the agent bridge):

- **Widget/human principal:** the widget receives a plane credential at boot (served with the
  host page/embed bootstrap, never guessable), presented per-call over `/rpc` and bound to the
  WebSocket connection at upgrade for `/rpc-ws`. Transport alone NEVER grants the human plane.
- **Agent principal:** `/api/mcp` with the session header.
- Absent or invalid credential = deny. A credential presented on the wrong plane = deny.
- Session resolution is strict: missing session = reject (never an empty ambient session);
  explicit header disagreeing with native-session identity = reject (never prefer one);
  deleted/stale session = reject before catalog construction.

Authorship stamping derives from the principal, so an agent physically cannot write as the
user even if it reaches the human transport.

This makes the session-binding work a hard prerequisite of this lane (shared with the
session-scope lane's boundary design): per-session secret plus the widget plane credential.
The broader hardening lane (tokens, origin policy) stays separate.

### One gate: enforcement at dispatch

Two layers, one authority:

1. **Root interceptor (the enforcement point).** The composite router is invoked through a
   dispatch interceptor (`rpc-mount.ts` already has `rootInterceptors`) that wraps EVERY call
   — core, extension, tool, in-process bridge — regardless of procedure provenance. It
   resolves the canonical procedure id against the `ResolvedAgentPolicy` catalog and applies
   the gate. Third-party routers are prebuilt `AnyRouter` values spread into the composite;
   spreading cannot retrofit middleware and third-party metadata is forgeable, so enforcement
   must not depend on the procedure's own chain. It doesn't: unknown-to-catalog procedures
   deny for agent principals by default.
2. **Shared-base middleware (sugar).** First-party procedures also carry the gate middleware
   from the platform base — fast-path and defense in depth, not the security boundary.

Gate policy, by resolved principal and policy:

- human principal → pass (the user's click is the consent).
- agent principal + `agent: false` → deny. Poison procedures (`chat.permissionDecision`,
  `page.reply`; `registry.call` is deleted outright) carry `agent: false` AND a startup
  assertion verifies they do; the interceptor denies them by canonical id before any name
  normalization or binding aliasing exists.
- agent principal + first-party + `readonly` and not `sensitive` → pass.
- agent principal + third-party → ask, ALWAYS — regardless of self-declared `readonly` —
  until the user marks that extension trusted (a per-extension toggle, persisted). A trusted
  extension's `readonly` is then honored like first-party. Self-asserted policy from the code
  being policed is not policy.
- agent principal + otherwise → ask via `AskRegistry` (existing flow: AG-UI approval chunk,
  listener requirement, `ASK_TIMEOUT_MS`), await, throw declared error on deny/timeout.

Approval hygiene:

- Order is fixed: validate and normalize input FIRST; the ask (and its digest) is computed
  over the exact normalized value the handler will receive, canonically serialized; the
  approval is bound to (canonical procedure id, input digest, origin run, ambient session)
  and consumed atomically with handler admission — one approval, one call.
- One ACTIVE ask per sandbox execution; further asks queue. Reentrancy is defined: a gated
  procedure invoked from within an approved call raises its own ask, which becomes the active
  ask (the outer approval is already consumed at admission) — no deadlock by construction.
  Pending asks are cancelled when the originating run stops or the MCP request disconnects.

The three existing gate sites collapse into the interceptor. Scope stated honestly: the gate
governs procedure INVOCATION. Extension module load, router construction, and catalog build
run extension code before any gate — that trust boundary is extension installation itself,
which is exactly why third-party procedures ask by default.

### Ambient session

Per the session-ambient-context design: the boundary parses the session; every capability
execution runs inside `withSession(sessionId, () => ...)` — entered around EACH call at the
bridge/interceptor, not merely the HTTP route, and re-entered for every stream tick, error,
and cleanup (`AsyncResource.bind` where producers register outside the request). Handlers
derive all authority from context:

- scoping (room, session) from ambient `session()` — never from input, except procedures
  that explicitly ADDRESS another session (branded target param)
- authorship from the principal
- ids and timestamps server-generated
- patches validated for ownership (row belongs to ambient room) before applying

### One catalog

A walker over the composite router builds `ResolvedAgentPolicy` entries for every included
procedure. The agent bridge invokes through the SAME dispatch path as the widget (in-process
client entering the root interceptor with an agent principal), so validation, gate, and
declared errors apply identically — no parallel execution path exists.

Naming: `sessions.list` → `external_sessions_list`; `ext.whiteboard.comments.insert` →
`external_whiteboard_comments_insert`. Post-normalization collisions are a build error
(deterministic encoding; no order-dependent suffixing). Error transit: only `Error.message`
crosses the isolate, so the existing `"CODE: message"` encoding stays; the recognized-code
set comes from the resolved catalog pinned at execution start (no drift mid-run), and the
shared gate errors are always recognized.

`assistCapabilities` is deleted; `conciv_ui` and `conciv_extensions` become normal procedures
with honest meta (`conciv_ui` is not readonly — it blocks the run on user attention). The
builtin `open` tool loses its false `mutating: false` (host-side effect → ask), consistent
with `editor.open`.

### Core contract classification (2026-08-22 inventory)

- **readonly:** `sessions.list`†, `sessions.resolve`, `markers.list`, `navigation.get`,
  `registry.catalog`, `page.symbolicate`, `page.changes`, `server.config/urls`,
  `meta.models/commands/tools/engine`
- **readonly + sensitive (ask):** `drafts.get`, `captures.list`,
  `server.resolve/graph/transform` (these execute Vite plugin hooks — reads that run code),
  recorder replay reads, tanstack loader/query-cache reads
- **ask (default):** `sessions.create/open/restore/rename/model/compact/delete`,
  `drafts.set`, `navigation.set`, `page.clearChanges`, `server.reload/restart`,
  `editor.open/openFromFrames`, `chat.uiReply`
- **cross-session only:** `chat.send`, `chat.stop` — explicit branded target, ask-gated.
  Targets canonicalized before comparison; agent-initiated sends propagate an origin trace
  (visited session ids + depth cap); `SELF_TARGET` and `CYCLE` are declared errors;
  per-origin concurrency and rate limits.
- **denied:** `chat.permissionDecision`, `page.reply` (`agent: false` + startup assertion);
  `registry.call` deleted (widget calls procedures directly; its bespoke approval path dies
  with it).

† session-scoped listings return metadata only; cross-session CONTENT reads are sensitive.

### Streams: bounded collectors

Procedures marked `stream: true` (`chat.subscribe`, `page.queries`, whiteboard `changes`,
recorder `control`, test-runner `stream`) are exposed to the agent as collectors with a
non-colliding envelope: `{input: <procedure input>, collect?: {limit?, timeoutMs?}}` —
never merged into the procedure's own input fields. Server-enforced ceilings: max events,
max collected bytes (checked per event BEFORE accumulation — the result cap only truncates
output after allocation), max duration, max concurrent collectors per execution. Bounds
validated (zero/negative/NaN/oversized → declared error). Collection runs under an
`AbortController`; unsubscribe/`iterator.return()` in `finally`; aborted on limit, timeout,
isolate termination, or MCP disconnect. Each execution re-subscribes; no persistent cursors
in v1.

### Facade collapse — per surface, equivalence-checked

Collapse happens where the router procedure, after the authority rework, is behaviorally
equivalent to the tool. Where the tool carries orchestration the router lacks, the tool's
logic BECOMES the procedure:

- **whiteboard:** the implementation plan MUST contain a verb-by-verb migration table
  covering the ENTIRE router — comments, pins, `reads`, `cursor`, `canvasPending`,
  `canvasReplies`, elements incl. bulk ops — specifying per verb: server-generated fields,
  ambient fields, owning identity (whose read receipt, whose cursor), cross-room rejection,
  bulk transaction semantics for mixed-room rows, and agent visibility
  (visible/ask/widget-only). `comment.create/reply` orchestration (anchor enrichment, atomic
  comment+pin, thread rules) moves into the procedures; raw insert/update/remove on those
  tables cease to exist. Server-generated ids/timestamps require an optimistic-sync
  reconciliation protocol (client correlation key echoed in the mutation response) — designed
  in the plan BEFORE deleting raw CRUD, so widget optimistic rows re-key instead of
  duplicating.
- **recorder:** `recording_start/stop/pull` orchestration (attach-wait, rollback, distill,
  keyframes) becomes procedures alongside the buffer reads; `reset` = ask; `presence` stays
  widget-plane.
- **tanstack:** verb-by-verb matrix in the implementation plan: canonical schema, binding
  (client verb vs server adapter), renderer, and what breaks, per operation. Two families
  merge; genuinely distinct operations survive distinctly.
- **terminal:** router gets meta, agent-visible (ask where mutating). `/tty` stays plumbing.
- **page, ios, test-runner:** single-surface already; meta only.

### Sequencing

1. `feat/session-scope-enforcement` lands first: ambient `session()`, strict boundary parses,
   `withSession`, per-session secret. The widget plane credential is designed alongside that
   lane's boundary work.
2. Platform base + principal adapters + root-interceptor gate; core contract migrates;
   catalog walker + in-process bridge; collectors.
3. Extension router authority rework + facade collapse, per extension (whiteboard last — it
   carries the sync-protocol redesign).

## Testing

- Catalog: every included procedure appears exactly once, correct name, or is
  denied/wrapped/build-failed for a stated reason; classification snapshot so a new bare
  procedure surfaces in review as ask-gated; name collision = build error; `agent: false`
  procedure with no summary builds fine (exclusion resolved first).
- Gate at dispatch: a third-party router procedure registered WITHOUT the platform base is
  still gated (interceptor test — the load-bearing one); unknown-to-catalog procedure denies
  for agent principal; forged `{plane: 'human'}` context from in-process code denies; human
  credential on `/api/mcp` denies; no credential denies.
- Trust tier: third-party `readonly` procedure asks; after the extension is marked trusted,
  it passes; first-party `readonly` passes throughout.
- Approval: digest over normalized input (an approval replayed with different input is
  rejected; input normalization differences don't break match); nested gated call raises its
  own ask without deadlock; run stop cancels pending asks.
- Identity: comment via MCP is agent-stamped; via widget RPC user-stamped; author field in
  input fails schema; missing/conflicting session header rejects.
- Cross-session: self send → `SELF_TARGET`; A→B→A → `CYCLE`; depth cap; rate limit.
- Collectors: ceilings enforced per event before accumulation; abort cleanup verified (no
  leaked subscriptions); envelope keeps procedure inputs intact; two sessions collecting
  concurrently see only their own events (ALS test).
- Collapse: widget flows unchanged after rework, incl. optimistic-sync re-key (existing
  suites; whiteboard suite CI-only).

## Out of scope

- Full local auth hardening (tokens, origin allowlists) beyond the session secret + widget
  plane credential minimum.
- Persistent stream cursors across executions (v2 if collectors prove insufficient).
- CLI and plain HTTP plumbing (`/health`, `/native`, `/api/shutdown`, `/tty`).
