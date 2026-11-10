# Chat column: spacing from gap and tokens only

## Goal

The chat thread column is laid out with flex/grid and `gap` from design tokens. No magic px spacing, no negative
margins, no padding on a row whose only job is to space it from its neighbour. Rows cannot collide by construction.

## Rules

1. The thread column (turns, out-of-band permission strip, dividers, the "Responding…" now row, anything else the
   pane renders between `Thread.Messages` and the composer) is one flex column. Its children are spaced only by
   the column's `gap`, from a `--chat-space` based token.
2. No row carries margin or padding to space itself from siblings. No negative margins anywhere in the column
   (`NOW_ROW_UNDER_TURN`'s `-mt-[13px]` goes, and `NOW_ROW_UNDER_TURN` with it).
3. The assistant turn's hover action bar (`ANSWER_ACTION_ROW_CLASS`, today `absolute bottom-0` inside the turn's
   `pb-[22px]`) becomes an in-flow row of the turn's own flex/grid layout. The turn reserves no padding for it. It
   must not shift layout when it appears on hover (reserve its row in the grid, toggle visibility/opacity, not
   presence).
4. Every fixed px spacing value in the chat column, the turn classes and the trace rows
   (`packages/ui-kit-chat/src/styled/turn-classes.ts`, `styled/thread.tsx`, `styled/trace/*`,
   `apps/conciv/src/pane/chat-pane.tsx`, `apps/conciv/src/pane/pending-approvals.tsx`) maps onto existing tokens
   (`--chat-space` multiples, existing gutter tokens). Hairline geometry (1px borders) stays px. A value with no
   token is flagged in the report, not invented.
5. Only `gap`, flex and grid space things. Padding is for a box's own inside (a card's inner padding), never for
   distance between siblings.

## Constraints

- The thread is virtualized from 15 turns: turn heights feed the virtualizer's measurements. The layout must not
  introduce height changes when a run starts/ends or on hover.
- Scroll/streaming perf: run `pnpm --filter @conciv/app test:perf` in Chromium and Firefox before handoff.
- Existing behaviour tests stay green; no new tests unless a behaviour changes.

## Evidence for review

Step 1, before any edit: an inventory table of every spacing value in the files above, current value, what it
becomes (gap on which container / token), or "flag".

Step 2, after: headless screenshots before/after at 420px and 1240px of: plain text turn finished; tool trace turn
finished; running with "Responding…"; running with the permission strip; compacting divider; stopped divider;
hover action bar shown; a long thread past the virtualization threshold scrolled mid-way.
