# Thread switch replays per-row entrance animation (documented 2026-07-19, PR #94)

## Behavior

Switching sessions/tabs or reopening a populated thread replays the `anim-msg` entrance
(160ms fade-in-up, unstaggered) on every historical message row, not only on newly arriving
messages. Rows animate simultaneously, so in practice the thread reads as a single container
fade rather than a visible cascade.

## Why the old suppression was removed (do not restore it)

PR #54 added a `hydrating` signal + `data-pw-hydrating` attribute + a
`[data-pw-hydrating] [data-pw-msg] { animation: none }` rule, armed by double-rAF timing, in
the panel, pane provider, chat pane, and a second copy in the terminal extension's
mirror-rail. PR #94 deleted all of it deliberately:

- The reference implementation (assistant-ui) puts an unconditional
  `fade-in slide-in-from-bottom-1 animate-in duration-150` on every message row with zero
  suppression machinery; simultaneous short unstaggered fades are the accepted look.
- Mount-timing guards (rAF/hydration flags) are fragile: they encode "how many frames until
  the DOM settles" and silently break under Suspense, streaming SSR, and scheduler changes.

## Proper fix, if the replay ever needs to go

Make the suppression data-driven, not timing-driven: the thread renderer knows whether a row
comes from restored history or from a live stream append, so pass that through render state
(for example an `entered` flag on restored messages, or keying the animation to
`message.isLast()`-style state as `thread.tsx` already does for other affordances) and skip
the animation class for restored rows. If the motion merely feels heavy, the sanctioned tweak
is reducing the `pw-fade-in-up` distance (8px) toward upstream's 4px — not re-adding
suppression plumbing.
