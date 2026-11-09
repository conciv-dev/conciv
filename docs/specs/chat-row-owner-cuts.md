# Chat: trace rows and result bodies cost a fraction of what they cost today

## Goal

Today a new trace row creates 251 Solid owners (144 ours) and a result body 300 (100 ours). Bring ours down to what
the row actually shows. Owner trees, source-mapped:

- `/private/tmp/claude-501/-Users-omrikatz-Public-web-aidx/cf3d62ab-fbe3-44c9-b397-19316cb76228/scratchpad/dump2.mapped.txt` (row)
- `/private/tmp/claude-501/-Users-omrikatz-Public-web-aidx/cf3d62ab-fbe3-44c9-b397-19316cb76228/scratchpad/dump1.mapped.txt` (result body)

## Cuts

1. **Copy button.** Each output block builds a tooltip state machine, an Ark Swap with two lucide icons and presence
   on mount. Build the tooltip and swap only on first hover or focus, the Ark way: `lazyMount`/`unmountOnExit`, as
   `c43b2d197` did for tooltips. If a list of outputs can share one tooltip with Ark's multiple-trigger support
   (`Tooltip.Trigger value`, as `TruncatedTextGroup` in `98ca6d5a2` does), prefer that.
2. **Provider and memo layers.** `card-chrome.tsx`, `tool-card.tsx`, `tool-duration.tsx` and `tool-call-card.tsx`
   each add context providers and memos that repeat the same derivation. Fold them so each value is derived once per
   row.
3. **Show chains.** In `trace-row.tsx` (38 owners), `file-read-card.tsx` (13) and `clamp.tsx` (12), replace `Show`
   chains and memos that only compute a plain value with plain derived values or a single `Switch`.
4. **Ark spread layers.** Where our wrapper passes props through more than one Ark component spread for the same
   element, flatten it to one.
5. **Leave Ark, zag and lucide internals alone.** Do not swap Collapsible, do not use `<details>`, do not replace
   lucide with hand-made SVG. If library-owned owners are still the bulk afterwards, report the number.

## Animations (hard rule)

No animation may be lost or changed:

- Collapsible expand and collapse;
- the row entrance (`anim-*`);
- the rail ring;
- tooltip open and close;
- the copy-button icon swap;
- the clamp reveal;
- reduced-motion behaviour.

For every component you change, save headless frame captures from mid-animation, before and after, to
`/private/tmp/claude-501/-Users-omrikatz-Public-web-aidx/cf3d62ab-fbe3-44c9-b397-19316cb76228/scratchpad/perf-anim/`.
The report lists which animations were verified and how. A lazily built tooltip or swap must still animate on its
first open.

## Rules

- Behaviour and pixels stay the same.
- Repo AGENTS.md rules apply in full:
  - zero comments, no `as`/`any`/non-null, no em dashes;
  - no raw `createSignal`/`createEffect`;
  - library way first;
  - no `git stash`.

## Evidence

- Owners per new trace row and per result body, before and after, broken down into ours, Ark, zag and lucide.
- The existing cards, thread and output tests stay green. No new test files.
- Screenshots of the affected states, before and after, at 420px.
