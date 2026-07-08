# Whiteboard element authorship + AI-can't-touch-human guard

Date: 2026-07-08
Status: approved (design), pending implementation plan

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

Non-goals: authenticated accounts (identity stays guest-level, same as comments today);
protecting against a malicious browser client (threat model is AI-vs-human in a trusted local tool).

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

Delete (guard when target `ownerKind === 'human'`):

| # | Site | Caller | Guard |
|---|------|--------|-------|
| 4 | `POST /elements/:scope/bulk-delete` → `deleteElements` | browser | none (human action) |
| 5 | `canvas.delete` → `deleteElement` | AI | approval if owner human |
| 6 | `canvas.clear` → `deleteElements(live)` | AI | approval if any live element is human-owned |
| 7 | `canvas.discard` → `deleteElements(draft)` | AI | none (AI's own draft) |

The browser tags each row's author before PUT. Because the store preserves `owner` on update, a human
`onChange` re-sending an element never clobbers its original owner; it only advances `lastEditedBy`.

## Protection guard (approval gate)

The ownership decision needs the `store`, so it lives in the whiteboard tool handlers, not core's
generic permission gate (which decides pre-handler, keyed on tool name only, with no DB access).

- Add `requestApproval(request, summary) => Promise<boolean>` to `WhiteboardToolContext`, wired in
  `app.ts` from the existing `uiBus` approval machinery (`injectApproval` + pending-await — the same
  native card the permission gate uses; per the native-approval-hybrid decision, native display +
  out-of-band decision).
- `canvas.update` / `canvas.delete`: read target `ownerKind`. If `human` → `requestApproval`; on deny
  return `{updated:false, blocked:true, reason}` / `{deleted:null, blocked:true, reason}`; on allow
  proceed and stamp `lastEditedBy = {ai, model}`. If `ai` → proceed silently.
- `canvas.clear`: if any live element is human-owned → one `requestApproval` covering the wipe; else
  proceed. Remove the static `approval: 'ask'` from `canvasDeleteDef`/`canvasClearDef` — the
  conditional in-handler path replaces it (AI stops being prompted for its own drawings).
- `canvas.update` never writes `owner` (it builds the row without owner fields; store preserves it),
  so the AI cannot relabel a human element as AI-owned via a data patch.

## UI — see who drew what

Selecting or hovering an element shows an author chip ("Guest 3f2a" / "AI · opus") reusing the
existing `Avatar` component. Smaller piece; core value is know + protect. Kept in scope but implemented
last so it can be trimmed if the plan runs long.

## Testing

Real-browser Playwright integration tests (never jsdom), loading the prebuilt widget bundle:

- Human draws an element → row `ownerKind = 'human'`, name = guest name.
- AI `canvas.draw` + `canvas.commit` → row `ownerKind = 'ai'`, `ownerModel` set.
- AI `canvas.update` on a human element → approval prompt appears; deny leaves element unchanged;
  allow applies the patch and flips `lastEditedByKind` to `'ai'` while `ownerKind` stays `'human'`.
- AI `canvas.update`/`canvas.delete` on its own (AI-owned) element → no prompt, applies immediately.
- AI `canvas.clear` with a human element present → prompt; with only AI elements → no prompt.
- Store-level: updating an existing row never changes `ownerKind` (invariant test).

## Rollback

Single feature; `git revert`. No staged rollout, no flags (per project convention).
