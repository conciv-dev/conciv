---
'@internal/frontend-defaults': patch
'@conciv/ui-kit-chat': patch
---

Losing the engine for a few seconds during a run no longer drops your queued message: it comes back to the composer, unsent, as Stop already does, or into that session's draft when you are looking at another session (text only: images in the queue are not kept there). The same holds when the run itself fails with an error while a message waits in the queue; before, the queued message was dropped there too.

The message already being answered is no longer put back in the composer when the connection or the run fails, so pressing Enter no longer sends it a second time. Use Retry to run it again. A message that had no answer yet when the connection failed comes back to the composer ahead of any queued messages, so neither is lost. The same goes for anything you type while a message is sending: if that send fails before any reply, the failed message comes back first and what you typed stays after it, where before only what you typed was kept.

Text an extension view inserts into the draft is also kept when the saved draft could not be loaded; before, it was dropped.
