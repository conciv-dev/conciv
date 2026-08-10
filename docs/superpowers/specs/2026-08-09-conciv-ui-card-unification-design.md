# conciv_ui card unification: addResult on the standard card contract

Date: 2026-08-09. Branch: feat/tool-cards (epic #344, PR #348). Status: approved by Omri in session.

## Problem

Two complete implementations of the conciv_ui tool card exist:

- `apps/conciv/src/pane/conciv-ui-card.tsx` (224 lines): the real interactive card. Renders
  Choices / Confirm / Diff / Form, each wired to an `onAnswer` that calls the app's
  `rpc.chat.uiReply` mutation. Injected first in the chat-pane dispatch list, so it always wins.
- `packages/tools/src/cards/ui-card.tsx` (32 lines): a passive summary (icon + title + question
  text). Created by the 2E colocation rule ("cards ship from the package that defines the tool")
  but unreachable in the product: dead code that only Storybook renders.

Drift between them is unguarded: an input-shape change updates one and not the other.

## Design decision (ported from assistant-ui, verified against its api-surface)

assistant-ui's `ToolCallMessagePartProps` gives EVERY tool UI an
`addResult: (result) => void` as a standard prop. Human-in-the-loop answering is not a
side-channel capability: it is completing the pending tool call. The card collects the answer,
calls `addResult(value)`, the runtime delivers it as the tool's result, and the answered state
re-renders from the result prop like any other tool card. (assistant-ui also carries `resume`
and `respondToApproval` in the same shape; we port only `addResult` now.)

Rejected alternatives: ctx capability injection (treats answering as an optional bolt-on),
per-card factory exports (constructor per capability), Solid context provider (hides the
dependency inside card internals).

## Contract change

`packages/protocol/src/tool-view-types.ts`, `ToolCardProps` gains:

```ts
addResult: (value: UiAnswerValue) => void
```

- Standard for all cards, sitting beside `part`/`result`/`ctx`. Non-optional in the type: the
  HOST wires it once at the dispatch layer; hosts without a live turn (storybook fixtures,
  INERT_TOOL_CTX-style) pass a no-op or recording stub. If typing `UiAnswerValue` at the
  protocol layer creates an import-direction problem, the protocol type is the wire-shape
  union (`unknown` is NOT acceptable; mirror the existing zod `UiAnswerValue` source of truth).
- `result` stays the single source of answered state. No new state anywhere.

## Host wiring (apps/conciv)

- Where `makeToolViewCtx`/dispatch already composes card props in chat-pane, wire
  `addResult: (value) => uiReply.mutate({toolCallId: part.id, value})` ONCE for all cards.
  The existing `uiReply` mutation (with its "no longer waiting" error toast) moves/stays here.
- Delete `concivUiEntry` and `apps/conciv/src/pane/conciv-ui-card.tsx` entirely.

## The one card (packages/tools/src/cards/ui-card.tsx)

Move the interactive internals from the app card into the package card:

- Pending (no result): render Choices / Confirm / Diff / Form (Switch on `kind`, Form is the
  fallback), each calling `props.addResult(value)`.
- In-flight: after the user answers, disable the inputs optimistically until the result streams
  back (no local answered flag; a plain "sent" disabled state driven by a local pending signal
  reset on props.result change is acceptable ONLY if it cannot survive reload; prefer deriving
  from the mutation state if reachable, else the minimal local signal).
- Answered (result present): answered summary derived from `parseUiOutput` (chosen option
  highlighted / note shown). Reload/replay is automatically correct because the transcript
  carries the result.
- All interactive chrome via Ark through ui-kit-system (buttons, radio/listbox, form inputs)
  and the existing card vocabulary (ToolCard shell, Chip, NoteRow). The current app card's
  hand-rolled pieces get the same conformance treatment during the move: match what exists,
  do not invent new primitives.

## Deletions

- `apps/conciv/src/pane/conciv-ui-card.tsx` and the `concivUiEntry` in chat-pane.
- The passive-only body of the packaged UiCard (replaced by the full card).

## Storybook

Stories in `packages/tools/src/cards/ui-card.stories.tsx`: pending state per kind (choices,
confirm, diff, form), answered state, and an interaction story whose `addResult` records the
payload and asserts it (play: click a choice, expect recorded value + disabled inputs).

## Tests

- Browser test (owning package or app dispatch test, NOT examples): click a choice fires
  `addResult` with the right payload; answered fixture renders the answered state and no
  interactive controls (`queryByRole` for absence).
- The existing app dispatch precedence test updates: conciv_ui now resolves to the package card.
- Reload correctness is covered by construction (result in transcript ⇒ answered state); assert
  via the answered-fixture test.

## Out of scope

`resume` / `respondToApproval` porting; approval-flow rework; whiteboard pin cards.
