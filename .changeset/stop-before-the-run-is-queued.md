---
'@conciv/ai': patch
---

Stop now works from the moment you send. A Stop pressed before the engine has started on your message used to be lost: the reply streamed in, "Responding…" stayed, and the Stop button came back as if you never pressed it (over a plain HTTP connection the message could vanish from the conversation instead). Now the button shows "Stopping…" at once, the stop is held until the engine starts the run, and the run then ends with the Stopped line, which a reload still shows.
