---
'@conciv/app': patch
'@conciv/ai': patch
---

The message queue now sits directly above the composer instead of under the pane header, and each queued row shows its Steer and Remove buttons at all times, with a visible keyboard focus ring. Stop no longer sends the queued messages as a new turn: it stops the run and puts them back in the composer, in order, unsent. `ChatSession.interruptAndFlush` is removed.
