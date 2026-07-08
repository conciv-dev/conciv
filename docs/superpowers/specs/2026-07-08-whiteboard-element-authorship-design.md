# Whiteboard element authorship + AI-can't-touch-human guard

Date: 2026-07-08
Status: descoped for implementation — see the plan at
`docs/superpowers/plans/2026-07-08-whiteboard-element-authorship.md`

> **Descope note (2026-07-08):** the store-level authorization, caller/authority argument, HTTP
> capability token, and Hono classify-middleware described below are **deferred**. A proper core-level
> security mechanism will come later; the raw-FS/HTTP bypass is tracked in issue #47. The shipped
> feature is: author columns (owner + lastEditedBy), owner immutability in the store, and the AI asking
> for **approval at the tool handler** before it edits/deletes a human-owned element — reusing the
> existing (assistant-ui-shaped) `injectApproval` → `ApprovalModal` → `respondApproval` pipeline via a
> small `PermissionGate.request` → `ServerApi.approvals` hook. The "Enforcement — authorization at the
> store" and "Trust boundary" / capability sections below are retained as the design record for that
> future work, not this implementation.

## Problem

The whiteboard has multiplayer attribution for comments (`authorKind: 'human' | 'ai'`) and cursors
(`kind: 'human' | 'agent'`), but canvas **elements** carry no author. `canvasElements` stores only
`room`, `elementId`, `data`, `version`. So there is no way to know whether a drawing was made by a
human or by the AI, and nothing stops the AI from silently editing or deleting a human's drawing.

Concretely: `canvas.update` (`tool/canvas/server.ts`) patches any element by `elementId` with no
author check and no approval. `canvas.delete`/`canvas.clear` always prompt (static `approval: 'ask'`),
which is safe but coarse — the AI is prompted even when touching its own drawings.

## Goals

1. Every element records who created it (`owner`, permanent) and who last changed it (`lastEditedBy`).
2. The AI cannot modify or delete a human-authored element without explicit human approval.
3. The AI can freely modify/delete its own elements (no prompt).
4. Users can see who drew a given element.
5. The guard holds against **any** door the AI has to the data (MCP tools, HTTP routes, `curl` via
   Bash), not just the `canvas.*` tools — enforcement is at the store, authority is unforgeable.

Non-goals: authenticated multi-user accounts (identity stays guest-level, same as comments today);
defending against an agent that can write the libSQL file directly — that is sandbox-FS isolation, out
of the app layer's reach (see Trust boundary).

## Identity model

Per-person, mirroring comments. Human identity is the existing ephemeral guest identity
(`client/overlay.tsx`: a sessionStorage GUID + `Guest xxxx` name + palette color) — the same source
comments use. AI identity is its model string. Both `owner` and `lastEditedBy` carry kind + id + name
(+ model for AI).

## Data model

`canvasElements` and `canvasDraftElements` (`server/db/schema.ts`) and `elementRow`
(`shared/rows.ts`) gain flat author columns, matching the flat style of `comments`:

```
ownerKind          'human' | 'ai'   notNull   default 'human'
ownerId            text  nullable
ownerName          text  nullable
ownerModel         text  nullable
lastEditedByKind   'human' | 'ai'   notNull   default 'human'
lastEditedById     text  nullable
lastEditedByName   text  nullable
lastEditedByModel  text  nullable
```

Drizzle migration in `drizzle/`. Existing rows backfill to `ownerKind = 'human'` — conservative: the
AI must ask before touching any pre-existing drawing. `elementRow` zod schema updated to match;
`expectTypeOf` pins zod ↔ drizzle (per the whiteboard-tanstack-db convention).

## Owner invariant — the single chokepoint

Every element write in the extension flows through `store.upsertElement` / `upsertElements`. The AI's
draw tools (`canvas.svg`/`draw`/`diagram`/`connect`) do **not** write elements — they insert
`canvasPending` rows; the browser converts pending → elements and writes them via the HTTP element
routes. The AI's only direct element writes are `canvas.update`/`delete`/`clear`/`discard`.

`upsertElement` already reads the existing row (for its version check) and its `onConflictDoUpdate`
set-clause only touches `{data, version}`. So we enforce the invariant there:

- **Insert path** (`values(row)`): writes `owner*` and `lastEditedBy*` from the row.
- **Update path** (`onConflictDoUpdate.set`): add `lastEditedBy*`; leave `owner*` out → owner is
  preserved automatically.

Result: **`owner` is immutable after first insert; no caller — browser or AI — can rewrite it.** This
is what "cover all inserts and updates" reduces to: one store method, not a stamp-at-every-callsite
discipline.

## Write-site coverage map

Insert / update (stamp `owner` on insert, `lastEditedBy` always — all via `upsertElement`):

| # | Site | Caller | Author source |
|---|------|--------|---------------|
| 1 | `PUT /elements/:scope` → `upsertElement` | browser | human onChange → guest identity; AI draft-commit conversion → `{ai, model}` |
| 2 | `PUT /elements/:scope/bulk` → `upsertElements` | browser | same |
| 3 | `canvas.update` → `upsertElement` | AI (server) | `lastEditedBy = {ai, model}`; `owner` preserved by store |

Delete / mutate (store rejects human-owned target unless `authority==='human'` or valid token):

| # | Site | Caller authority | Store outcome on human-owned target |
|---|------|------------------|-------------------------------------|
| 4 | `POST /elements/:scope/bulk-delete` → `deleteElements` | `human` (browser, capability) / `untrusted` (forged) | allowed with capability; rejected without |
| 5 | `canvas.delete` → `deleteElement` | `ai` | rejected unless approval token supplied |
| 6 | `canvas.clear` → `deleteElements(live)` | `ai` | rejected unless approval token supplied |
| 7 | `canvas.discard` → `deleteElements(draft)` | `ai` | n/a — draft is AI-owned |

The browser tags each row's author before PUT. Because the store preserves `owner` on update, a human
`onChange` re-sending an element never clobbers its original owner; it only advances `lastEditedBy`.
Every row in the map reaches the store, which is the sole authorization point.

## Enforcement — authorization at the store, not the handler

A guard that lives only in the `canvas.*` tool handlers is per-door: the AI has other doors to the same
rows (the unguarded `POST /elements/:scope/bulk-delete` route, `PUT /elements`, or raw `curl` via its
Bash tool). Handler-only enforcement is walk-around-able. So **authorization lives at the lowest shared
code layer every door passes through — the store** — and the interactive approval UI stays in the
handler. Split cleanly:

- **Authorization = store** (`upsertElement`/`deleteElement`/`deleteElements`). These gain a required
  `caller: {authority: 'human' | 'ai', approvalToken?: string}` argument. Rule, enforced in the store:

  > A mutation or delete of a row whose `ownerKind === 'human'` is **rejected** unless
  > `authority === 'human'` **or** a valid one-shot `approvalToken` is presented.

  Every path — HTTP routes, `canvas.update`, `canvas.delete`, `canvas.clear`, a forged `curl` — calls
  the store, so none can skip it. AI writes to its own (`ownerKind === 'ai'`) rows pass freely.

- **Authority derivation = a small Hono classify-middleware at the HTTP boundary.** The browser holds a
  per-server-boot **capability token** (random, minted in server memory) delivered through the codebase's
  existing browser-only bootstrap channel: a `pw-whiteboard-cap` `<meta>` tag injected alongside
  `pw-api-base`/`pw-widget` in `widget-tags.ts` (the host page the sandboxed agent never receives — not a
  fetchable endpoint; there is deliberately **no** `GET /capability`, which the agent could just call).
  The widget reads the meta tag and sends the token as an `x-whiteboard-cap` header on element writes. A
  middleware on `/elements/*` classifies — `c.set('authority', header === capability ? 'human' :
  'untrusted')` (typed `Variables`) — and the route passes `c.get('authority')` into the store. We do
  **not** use `bearerAuth` (it rejects on mismatch; we need classify-not-reject, since an authorityless
  browser write to an AI-owned element must still succeed and the store is the decider) nor signed
  cookies (the widget is cross-origin to the API — see `widget-tags.ts` `pw-api-base` + CORS — so
  cross-origin cookies on http-localhost are the wrong tool).

- **AI authority is set in code, not from input.** The `canvas.*` handlers call the store with a literal
  `authority: 'ai'`. The AI cannot make a handler claim `'human'` — there is no input path to it.

- **Approval = one-shot token.** `WhiteboardToolContext` gains
  `requestApproval(request, summary) => Promise<string | null>`, wired in `app.ts` from the existing
  `uiBus` approval machinery (`injectApproval` + pending-await — the native card, per
  native-approval-hybrid). On approve it returns a short-lived one-shot token registered with the
  store's capability check; on deny, `null`. `canvas.update`/`delete`/`clear`, when the target is
  human-owned, call `requestApproval`, then pass the token into the store — the store, not the handler,
  is what actually permits the write. Remove the static `approval: 'ask'` on
  `canvasDeleteDef`/`canvasClearDef`; the store-backed path replaces it (and stops prompting the AI for
  its own drawings).

Note this is authorization, distinct from core's permission gate (`permission.ts`), which decides
pre-handler keyed on tool name only with no DB access — it cannot see element ownership, so it can't be
the enforcement point.

## Trust boundary — how far "AI can't hack around it" holds

- In-process MCP tool calls (the agent's everyday, silent path): **the real protection** —
  unforgeable, `authority: 'ai'` is literal in the handler, the store hard-blocks human-owned mutation
  without an approval token. No prompt-dependence.
- HTTP capability token: **defense-in-depth, not an absolute wall.** On one localhost box the agent
  could, via `curl`, try to read the host page and replay the header. Two things bound that: `curl`
  requires the agent's Bash tool, which is permission-gated (`command-policy.ts`) — not silent — and the
  token rides the browser-only meta-tag bootstrap, not a fetchable endpoint. We do not claim it defeats
  a determined, user-approved `curl`; the store guard on the MCP path is what makes the guarantee.
- **The ultimate floor is sandbox filesystem isolation.** The libSQL file lives under `stateRoot`. If
  the agent's sandbox exposes `stateRoot` as writable, the agent could open the sqlite file directly and
  `DELETE` rows beneath the store — no app-layer control can stop that. The sandbox must not mount
  `stateRoot` into the agent's writable FS; likewise the capability token must never be persisted there.
  This is the one boundary the app layer cannot enforce and the plan must verify at the sandbox config.

## UI — see who drew what

Selecting or hovering an element shows an author chip ("Guest 3f2a" / "AI · opus") reusing the
existing `Avatar` component. Smaller piece; core value is know + protect. Kept in scope but implemented
last so it can be trimmed if the plan runs long.

## Testing

Three layers, all against real infrastructure (no mocks), following the package's existing patterns.
Run cheapest-first: store → API → browser.

### 1. Store / DB (`test/store.test.ts`, real libSQL via `createStore(tmpdir)`)

The owner invariant **and the authorization rule** are the load-bearing guarantees, so both are tested
at the store where they live:

- Insert an element with `ownerKind: 'ai'` → row persists `owner*` and `lastEditedBy*`.
- Upsert the same `elementId` again (higher version) with `lastEditedBy: {human,...}` → `ownerKind`
  unchanged, `lastEditedByKind` now `'human'`, `version` advanced.
- Upsert with an incoming `ownerKind` that differs from the stored one → stored `owner*` still wins.
- **Authorization:** `deleteElement` / `upsertElement` against a human-owned row with
  `authority: 'ai'` and no token → **rejected**, row untouched. With `authority: 'human'` → allowed.
  With `authority: 'ai'` + a valid one-shot token → allowed once; the same token reused → rejected.
- **Authorization:** AI-authority write to an AI-owned row → allowed (no token needed).
- `emit` still fires the typed `upsert`/`delete` event only on an allowed write.
- `zod ↔ drizzle` type parity for the new columns is pinned with `expectTypeOf` in `test/rows.test.ts`.

### 2. API / HTTP routes (`test/routes.test.ts`, real Hono app via `serveApp` + real `fetch`)

- `PUT /elements/:scope` **with** the capability token → 200, `GET` returns author fields; second PUT
  preserves `owner`.
- `PUT /elements/:scope/bulk` with token → every returned row carries author fields.
- **Bypass simulation:** `POST /elements/:scope/bulk-delete` targeting a human-owned element **without**
  the capability token (the AI-`curl` case) → rejected (403/blocked), row still present on `GET`. With
  the token → deleted. This is the test that proves the walk-around door is closed.
- `elementRow` zod validation rejects a body missing `ownerKind`/`lastEditedByKind` (400).
- 409 version-conflict response still round-trips the stored row's author fields.

### 3. Browser integration (`test/*.it.test.ts`, Playwright/Chromium, prebuilt widget bundle)

- Human draws an element → row `ownerKind = 'human'`, name = guest name.
- AI `canvas.draw` + `canvas.commit` → row `ownerKind = 'ai'`, `ownerModel` set.
- AI `canvas.update` on a human element → approval prompt appears; deny leaves the element unchanged;
  allow applies the patch and flips `lastEditedByKind` to `'ai'` while `ownerKind` stays `'human'`.
- AI `canvas.update`/`canvas.delete` on its own (AI-owned) element → no prompt, applies immediately.
- AI `canvas.clear` with a human element present → prompt; with only AI elements → no prompt.
- Author chip renders the owner on select/hover (assert visible text/role, never CSS internals).

## Rollback

Single feature; `git revert`. No staged rollout, no flags (per project convention).
