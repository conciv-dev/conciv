# Terminal-initiated connect — design

Date: 2026-07-31. Status: revised after adversarial review (codex gpt-5.6-sol, 15 findings
folded); both open decisions RESOLVED by the user 2026-07-31 — v1 is claude-only
approvable (option a) and the nonce proof-of-session-control is IN. Builds on the
connected-external-terminal branch (server-persisted port, hardened Dialog, AskChannel,
adopt transaction, candidate listers); implementation starts on a NEW branch after that
branch clears its final gate.

## Problem

Connecting an external terminal session to the widget is one-directional today: the widget
discovers running harness sessions and the user adopts one from the picker. A user sitting
in a terminal session has no way to initiate from that side. They want: run one command in
the terminal, an approval popover appears in the widget, approving gives that terminal
session the same page powers the widget has.

## Shape

One harness-neutral CLI initiates; everything harness-specific stays server-side in the
existing per-harness adapters. Approval is human, in the widget shell. Approve runs the
same adoption path the picker uses and mints the session-scoped credential — this flow is
the reference consumer for the S23 token design (a non-adopted session obtains a
credential by asking and being approved).

## DECIDED — v1 harness scope: claude-only approvable (option a)

Only claude implements `HarnessAttach` today (`packages/harness/src/claude/index.ts`
registers `attach`; codex/opencode/pi do not). Approval outcome = adoption, and adoption
requires an attach implementation — so a codex/opencode/pi request can only ever reach
`unmatched`, which is non-approvable (see FSM). v1 ships the CLI and protocol
harness-neutral with approvable outcomes claude-only; other harnesses get honest terminal
copy ("this server's harness cannot attach live sessions yet"). Per-harness attach
(codex first) is a follow-up feature; copy and docs call out the claude-only caveat until
it lands.

## DECIDED — requester proof-of-session-control: nonce verification is IN

`{cwd, pid, ppidChain}` is caller-supplied and forgeable: a hostile local process can
submit a legitimate session's pid/ancestry, get the human to approve the convincing card,
and receive the token on ITS OWN held `await`. PID-tree matching proves the claimed
process exists, not that the socket caller owns it.

Mechanism: on `connect.request` the server returns a short nonce alongside
`{requestId, requesterKey}`. The CLI runs INSIDE the real session's terminal, so it
instructs the user (or the driving agent via `--json`) to have the session echo the nonce;
the server verifies the nonce appears in the matched candidate's transcript tail before
the request transitions from `unverified` to approvable `pending`. Requests that never
verify stay `unverified` and render like `unmatched` (non-approvable, honest copy). The
FSM gains the entry state: `unverified → pending` on nonce verification, expiry sweeps
both.

## 1. CLI — new package `@conciv/connect`

- Clone `@conciv/try`'s skeleton: citty command, clack UI, event-driven progress, plain
  `--json` event stream for agents driving it programmatically. Bin `conciv-connect`,
  runnable cold via `npx @conciv/connect`.
- Featherweight: NO `@conciv/core`/`@conciv/harness` runtime deps. Deps: citty, clack,
  `@conciv/contract` + the oRPC fetch client, `@conciv/protocol` (port/state-dir helpers).
- Flow: resolve project root walking up from cwd → read the server's persisted port from
  the project state dir → probe `/health` → `connect.request` → held `connect.await` →
  print the outcome.
- Identity payload: `{cwd, pid, ppidChain, harnessHint?}`. The SERVER matches it against
  its per-harness `attach.candidates` (pid-tree ∩ cwd) — the CLI never guesses.
- Terminal states, each with distinct copy and exit code: no-server-found,
  server-unreachable, no-widget-open, waiting (countdown), approved (prints the
  harness-specific finishing step, e.g. the reload command), denied, expired, failed
  (structured adoption-failure code rendered with its remedy), request-rate-limited,
  protocol-mismatch, invalid-response. Protocol mismatch is detected via the `/health`
  protocol version field (see §2) — NEVER inferred from a zod rejection; a zod rejection
  of a version-matched server renders as invalid-response (a bug, reported as such).

## 2. Wire — everything rides the oRPC contract

### Caller classes

Two procedure groups with different authentication:

- **Requester procedures** (`connect.request`, `connect.await`): callable by any local
  process — they are the pre-auth doorbell.
- **Widget-only procedures** (`connect.pendingRequests`, `connect.decide`): require the
  widget capability — a secret established over the live widget client connection (the
  page bootstrap already has an authenticated channel to the server; the capability rides
  it, is never persisted, and rotates per server start). A native local process without a
  live widget page cannot list pending requests (transcript-metadata leak) or
  self-approve. Loopback + CORS are NOT the boundary; this capability is.

### Procedures

- `connect.request({cwd, pid, ppidChain, harnessHint?}) → {requestId, requesterKey, expiresAt}` —
  errors: `NO_WIDGET` (no live widget client connected → refuse immediately),
  `RATE_LIMITED`. `requesterKey` is a per-request secret; `await` must present it (binds
  outcome delivery to the original requester).
- `connect.await({requestId, requesterKey}) → {outcome: 'approved', token, finishStep} |
  {outcome: 'denied'} | {outcome: 'expired'} | {outcome: 'failed', code, detail}` — a held
  request; errors: `NOT_FOUND` (unknown/expunged id), `FORBIDDEN` (wrong requesterKey).
  Semantics: terminal outcomes are stored for a bounded retention window (5 min) after
  resolution, so an `await` that registers late, reconnects after a drop, or retries still
  receives the real outcome (replayable within retention, requesterKey-bound); after
  retention → `NOT_FOUND`. Held connections register abort cleanup (client disconnect
  releases the waiter; the outcome stays stored). Server restart drops the in-memory
  store: the CLI's `await` fails at transport level and renders server-unreachable —
  documented, acceptable for v1.
- `connect.pendingRequests() → PendingConnectRequest[]` — widget-only; invalidated via
  the existing change stream. A pending request carries the matched candidate (the same
  `LiveSession` shape the picker renders) or an explicit `unmatched` marker.
- `connect.decide({requestId, approve: boolean}) → {outcome}` — widget-only; returns the
  same terminal-outcome union as `await` resolves to (the widget learns whether approval
  actually adopted, not a blind Ok). Errors: `EXPIRED`, `NOT_FOUND`, `UNAPPROVABLE`
  (approve on an unmatched/unverified request), `ALREADY_DECIDED` (lost the CAS, carries
  the winning outcome).

### Input validation (exact, at the boundary)

`connect.request` schema: `pid` positive int ≤ 2^22; `ppidChain` array of positive ints,
max length 32, strictly increasing-ancestor order not required but duplicates rejected;
`cwd` absolute path, max 1024 bytes, NUL rejected, canonicalized server-side via the
existing `realpathOrSelf` before ANY matching or storage (all dedupe/limit keys use the
canonical form); `harnessHint` an enum of known harness ids. Validation failures reject
BEFORE any candidate enumeration (enumeration shells out to `claude agents --json` and is
expensive; nothing caller-supplied may trigger it until the request passes schema + rate
limit + dedupe).

### Pending store + FSM

In-memory store, entry: `{id, requesterKey, state, candidateGeneration | unmatched,
expiresAt, resolvedAt?}`.

State machine, all transitions compare-and-set (single-process, so a plain synchronous
check-then-set on the Map is sufficient — the rule is that adoption side effects START
only after the CAS wins):

```
pending → deciding → approved | failed
pending → denied            (decide approve:false)
pending → expired           (sweep at expiresAt)
```

- `decide(approve:true)` CASes `pending → deciding`; only the winner runs
  `adoptLiveSession` + token mint (exactly once, structurally — not just a test
  assertion). Losers get `ALREADY_DECIDED`.
- Expiry sweep only fires on `pending`. `deciding` is NOT cancellable by expiry: a human
  clicked approve before the deadline; the adoption (which can run 20s+ of claude CLI
  subprocesses) is allowed to finish and resolves `approved` or `failed`. The CLI's
  countdown copy says "approval in progress" past zero when the state is `deciding`.
- Adoption failure codes surface as `{outcome:'failed', code}` with the adopt path's
  structured codes (`CWD_MISMATCH`, `ATTACH_CONFLICT`, `ATTACH_FAILED`,
  `INSTALL_FAILED`, plus `CANDIDATE_GONE`) — routine races, not exceptions.
- Terminal states retained 5 min (see `await` semantics), then expunged.

### Candidate generation binding

The pending entry snapshots a candidate GENERATION: `{harnessSessionId, pid,
processStartedAt, canonicalCwd, harnessKind}`. On approve, after re-listing candidates,
the decision proceeds only if ALL generation fields still match a live candidate; any
drift (pid reuse detected via processStartedAt, cwd change, session gone) resolves
`failed/CANDIDATE_GONE`. The card the human approved is the session that gets adopted, or
nothing is.

### Unmatched is non-approvable

Adoption requires `harnessSessionId` + `pid`; an unmatched request has neither. The
widget renders unmatched requests informationally (a terminal in this project asked to
connect; no matching session found) with Deny as the only decision; `decide(approve:true)`
on unmatched errors `UNAPPROVABLE` server-side regardless of UI.

### Rate limiting + dedupe (caller-independent)

Caller-supplied identity is spoofable, so limits cannot key on it alone:

- Global queue capacity: max 8 pending requests total; overflow → `RATE_LIMITED`.
- Global creation window: max 10 `connect.request` calls per minute across ALL callers;
  overflow → `RATE_LIMITED` with retry-after.
- Dedupe: a `connect.request` whose `(canonicalCwd, pid)` matches an existing `pending`
  entry is rejected `RATE_LIMITED` carrying the existing request's `expiresAt`. It does
  NOT return the existing requestId/requesterKey — dedupe never lets a second caller
  attach to the first caller's outcome.
- Expiry 120s (reuses the approval-gate timeout constant); sweep on expiry.

`/health` gains a `protocolVersion` integer; the CLI compares before calling any
procedure and renders protocol-mismatch with an upgrade hint on drift.

Approve path: existing `adoptLiveSession` verbatim (transaction, conflict check, install /
config-merge per harness) + mint the session-scoped token; token and finishing step return
through `connect.await`. Deny/expiry resolve the held await. No new attachment semantics —
terminal-initiated connect is a different doorbell on the same door.

## 3. Widget UI — shell-level, declarative, Ark

- Approval surface mounts in the widget SHELL (not any conversation): the hardened
  `Dialog` with `role="alertdialog"` (it is an interrupt), content = the existing
  `CandidateRow` card for the matched session.
- Fully declarative: `useQuery` over `connect.pendingRequests` (change-stream
  invalidation) merged client-side with a `dismissed` set (below); the dialog is
  `<Show when={head(visibleRequests)}>` over the merged view. No imperative open/push.
- **Dismissal semantics (explicit, not epoch-only):** Esc adds the request id to a
  client-local `dismissed` set — the request stays pending server-side (the terminal user
  may still be waiting; another widget client may decide). `visibleRequests` filters
  dismissed ids, so the dialog does NOT reopen for a dismissed request on the next
  invalidation. A dismissed request becomes visible again only if the user reopens it via
  a persistent affordance (a badge on the shell shows the count of pending-but-dismissed
  requests; clicking it clears the dismissed set). Dismissed ids are dropped from the set
  when their request resolves or expires. The dismissal epoch additionally guards late
  decide results from resurrecting a closed dialog (conflict-dialog pattern).
- Async matrix, every cell rendered: matched candidate (card) · unmatched/unverified
  request (informational, Deny-only) · loading (skeleton card, height-parity) ·
  decide-in-flight (busy, both actions disabled; `deciding` can outlive the countdown —
  copy says approval in progress) · decide-failed with structured code + retry (retry
  only where the code is retryable; `CANDIDATE_GONE` is terminal) · another-widget-won
  (`ALREADY_DECIDED` → content swaps to the winning outcome, self-dismisses) ·
  expired-under-cursor (content swaps to "request expired", self-dismisses politely) ·
  queued-behind-current (badge count) · widget-disconnect during decide (the standard
  connection-lost surface; on reconnect the query refetches and renders whatever state
  the store holds).
- Esc dismisses WITHOUT deciding (non-destructive Esc rule); Deny is an explicit button;
  expiry is the default deny. Queue: one popover at a time, FIFO over visible pending
  requests.
- A11y: focus map (initial focus = Deny, the safe action), live-region announcements for
  request-arrived / approved / denied / expired / failed, 44px targets, Intl plurals,
  harness-neutral copy throughout.

## 4. Security

- Loopback bind unchanged. Widget-only capability gates `pendingRequests` + `decide`
  (§2 caller classes). `requesterKey` binds outcome delivery to the requester.
- All inputs validated per the exact schema in §2 BEFORE any enumeration work; zod on
  every procedure; canonical cwd everywhere.
- Fail closed everywhere: no widget → refuse immediately; ambiguity → `unmatched` (human
  sees it, cannot approve it); nobody answers → expire-deny at 120s.
- Global + windowed rate limits and single-owner dedupe stop popover spam and queue
  flooding from any local process, independent of claimed identity.
- Token: minted only on human approval, scoped to the adopted session, revoked on detach.
  **Blocking prerequisite (was "deferred to S23"):** transport (header, never URL — URL
  tokens enter shell history/process listings, as `@conciv/try` already demonstrates),
  client-side storage/redaction rules, TTL, and replay behavior must be FIXED in the S23
  decision before implementation starts — the contract returns a bearer token to a
  pre-auth caller, so these are part of this feature's definition of done, not follow-ups.
- OPEN DECISION 2 (requester proof) above is the remaining identity-binding question.

## 5. Testing

- CLI: executed-bin harness (the connect-bridge C4 pattern) — spawn the real bin against a
  real server; cases for every terminal state incl. held-await approval, expiry,
  failed-with-code, rate limit, dedupe rejection, dead port file, protocol-mismatch (via
  /health version), invalid-response, requesterKey mismatch, late-await replay within
  retention, post-retention NOT_FOUND.
- Server: contract tests + adopt-path extensions on the S12 transaction suite: CAS approve
  adopts exactly once under concurrent decide; deny/expiry adopt nothing; expiry cannot
  cancel `deciding`; generation drift resolves CANDIDATE_GONE; unmatched approve errors
  UNAPPROVABLE; widget-only procedures reject without the capability; validation rejects
  before enumeration (asserted via a counting fake lister); global limits + dedupe
  single-ownership.
- Widget: real-Chromium browser tests over the full async matrix, incl. expiry-under-
  cursor, dismissal set (Esc → no reopen on invalidation → badge reopen), ALREADY_DECIDED
  swap, failed-code rendering, and dismissal-epoch; announcements and focus asserted per
  the slice-3 patterns.
- One end-to-end IT: real CLI → driven widget approves → adopted row exists, token
  authorizes `/api/mcp`, finishing step printed in the terminal.

## 6. Documentation (ships WITH the feature, not after)

- The docs task LOADS the `documentation` skill (Diátaxis) before writing. Under
  Diátaxis this splits cleanly: a HOW-TO GUIDE ("Connect a terminal session" — task-
  oriented, both directions) plus a REFERENCE section (CLI flags, exit codes, every
  terminal-state message verbatim). Do not blend explanation into the how-to; if the
  architecture needs explaining, that is a separate short explanation page.
- New docs page under `apps/site/content/docs/` (sibling of the quick-start pages, follow
  the existing mdx conventions and the docs writing style): "Connect a terminal session".
  It documents BOTH directions as one story — from the widget (the picker, already
  shipped on the connected-external-terminal branch) and from the terminal (this feature):
  the `npx @conciv/connect` command, what the approval popover looks like, what approve
  grants, the finishing step per harness (with the OPEN DECISION 1 caveat on which
  harnesses can complete approval in v1), and every failure message the CLI can print
  with what to do about each (no-server, no-widget, denied, expired, failed codes,
  rate-limited, protocol-mismatch).
- Screenshots are REAL captures, not mockups: the implementation plan includes a
  screenshot task that drives the flow headless (the slice-3 capture pattern) against the
  built site + widget — picker open, terminal running the CLI at the waiting state, the
  approval popover with a candidate card, the approved terminal printing the finishing
  step. Captures land in the docs page's asset convention; re-capture is scripted so docs
  don't rot when the UI shifts.
- The CLI's `--help` output and the docs page must agree verbatim on flag names and copy;
  a test asserts the docs page's command snippets parse against the real CLI (executed,
  the C4 pattern — no drifting snippets).

## Out of scope

- Any non-loopback/remote transport.
- MCP-access-only grants (approve is always full adoption).
- Auto-approval policies ("always allow this terminal") — explicitly deferred; every
  connect is a human decision until S23 settles grant lifetimes.
- Outcome durability across server restarts (in-memory store; restart → CLI renders
  server-unreachable).
- gemini-cli (upstream issue #96 unresolved).

## Open items inherited, not created

- S23 transport + lifetime decisions — now a BLOCKING prerequisite (see §4), scope
  shrunk by this design to: header transport details, storage/redaction, TTL, replay.
- The `attach.candidates` pid-tree matching precision per harness — matching by
  `(ppidChain ∩ candidate.pid) && sameCwd` is the v1 rule; harnesses whose listers lack
  pids degrade to `unmatched` honestly (and unmatched is non-approvable).
