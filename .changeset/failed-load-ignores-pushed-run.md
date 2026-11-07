---
'@conciv/ai': patch
---

A chat whose history load failed no longer joins a run pushed to it. It used to fetch the transcript into the failed chat but keep the load error, so the pane showed the server error with a Retry that sent the prompt again and stopped the run in flight. The failed load and its Retry now stay until Retry reopens the chat, which joins that run.
