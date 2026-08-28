---
'@conciv/ui-kit-chat': patch
---

The chat thread now has a single owner for its scroll position: the virtualizer. The stick-to-bottom phase machine, the thread pins, the top-anchor reserve and the follow-pause helper are gone, along with the `turnAnchor`, `topAnchorMessageClamp`, `scrollToBottomOn*` and `autoScroll` props on `Thread.Viewport` and the `data-follow` / `data-escaped` attributes. `data-at-bottom` is the remaining scroll attribute, and the only writes are the Latest button and sending a prompt. `@conciv/solid-stick-to-bottom` is no longer part of the thread's scroll path.
