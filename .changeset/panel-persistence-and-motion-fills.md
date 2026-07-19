---
'@conciv/it': patch
---

Fix widget flicker on open, restore FAB hover, and drop the recorder from the builtin extensions.

The panel subtree was destroyed on close, so every open remounted the chat pane, opened a fresh session and SSE subscription, and rendered blank for ~100ms before replaying every message row's entrance at once. The panel now mounts on first open and stays mounted; closing only toggles its visibility classes.

Entrance shortcuts (`anim-fab`, `anim-pop`, `anim-presence-in`) carried `animation-fill-mode: both`. Since the keyframes end at the element's natural state, the forwards fill only served to pin `transform` after the animation finished, which outranked the FAB's hover lift and press states. `anim-rise`/`anim-rise-d` keep a fill as `backwards`, which is what their `animation-delay` actually needs.

`@conciv/extension-recorder` is no longer registered as a builtin: it started rrweb capture on every page load whether or not a recording was wanted, and the resulting flush traffic degraded widget responsiveness (#114). The package is still published and can be enabled explicitly.
