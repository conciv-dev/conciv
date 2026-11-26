---
'@conciv/backend': patch
'@internal/frontend-defaults': patch
---

Stop now works from the moment you send. A Stop pressed before the engine has started on your message used to be lost: the reply streamed in, "Responding…" stayed, and the Stop button came back as if you never pressed it (over a plain HTTP connection the message could vanish from the conversation instead). Now the button shows "Stopping…" at once, the stop is held until the engine starts the run, and the run then ends with the Stopped line, which a reload still shows.

If the message never reaches the engine after you pressed Stop (the connection drops first), it is taken back: it leaves the conversation and its text is back in the composer, with no error and no Retry, so nothing can be sent twice. A message that fails to send when you did not press Stop still shows its error as before.
