# Chat: a streamed chunk re-runs only what changed

## Goal

When one part of one message changes, only these may re-run:

- the `useChat` snapshot memos from `@tanstack/ai-solid` (13 today);
- the computations of the row whose part changed.

Today one such chunk re-runs 85 computations. About 40 of them are our code reading a whole list (`chat.messages()`,
`thread.turns`, all parts of a turn or segment). The measured list, source-mapped, is in
`/private/tmp/claude-501/-Users-omrikatz-Public-web-aidx/cf3d62ab-fbe3-44c9-b397-19316cb76228/scratchpad/u47.mapped.txt`.

## The library pattern

`@tanstack/ai-solid` keeps the snapshot in one signal (`use-chat.js:49-56`). Its frozen copies keep the identity of
every unchanged message and part. Its own renderer (`src/chat-ui/create-ui.tsx:472`, and
`examples/ts-solid-chat/src/routes/index.tsx` in the TanStack/ai repo) is a keyed `<For>` over messages, then a keyed
`<For>` over parts, read straight from the accessor. Follow that shape.

## Design

1. **List readers.** Only two kinds of list reader remain: the turn list, keyed by message id, and each turn's parts,
   keyed by part / tool-call id. Use `keyArray` / `mapArray`, as `d569d1ba2` does for trace rows. Grouping into turns
   is incremental: an unchanged turn keeps its object, so nothing keyed on it wakes.
2. **Per-turn data.** Everything that today scans the whole list hangs off the turn or part that owns it:
   - divider and stopped data (`chat-pane.tsx` `threadDividers` / `renderTurnPrefix`);
   - the harness name and "mixed";
   - the result pairing (`primitives/thread/thread.tsx:119`, `styled/thread.tsx:150-179`);
   - the segment rollup.
3. **Pane-level values** read the last or first turn item only:
   - `activeCall`, `transcriptToolCallIds`, the narration row and the composer placeholder read the last turn;
   - `older-messages` `oldestId` and `session.ts` `loadFailed` read the first turn and the error.
4. **Durations** move into the row and derive from its own part's state changes. The tool-view ctx `durationFor`
   changes shape accordingly (approved internal v0 API change; update every caller, no shims).
5. **Virtualizer.** Its count and turn lookup read the keyed list's length and items, not `turns()[index]`.
   `TurnSlot` receives its turn item directly.
6. **Whole-list `isEqual` memos are not allowed.** If a value needs a whole-list scan per chunk, the design is wrong.
   Find the per-item home for it.

## Rules

- Behaviour and pixels stay the same. This covers:
  - turn grouping, dividers, the stopped line, the rail and the narration row;
  - paging (#742, #746) and the virtualizer;
  - every animation.
- No library patch, no batching or rAF in the connection, no `<details>`, no Collapsible swap.
- Repo AGENTS.md rules apply in full:
  - zero comments, no `as`/`any`/non-null, no em dashes;
  - no raw `createSignal`/`createEffect`;
  - `@solid-primitives` before hand-rolled code;
  - no `git stash`.

## Evidence

- The same dev-hook counter as before, on the multi-tool run:
  - re-runs on a single-part chunk, before and after (target: about 13 plus the changed row);
  - the full owner list for that chunk after the change;
  - whole-run totals.
- Existing thread, session, pane and paging tests stay green. No new test files. One assertion that fails on today's
  code is welcome only if it tests behaviour, not counts.
- Headless screenshots before and after of a finished multi-tool turn, a running turn and a long thread mid-scroll,
  at 420px and 1240px.
