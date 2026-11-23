---
'@conciv/client': patch
'@conciv/ai': patch
---

`@conciv/client`: the panel fetches its history once, after its chat events stream is live, so nothing that happens while it opens is missed, and after the stream drops and comes back the panel fetches its history again and shows what happened meanwhile. A chat events stream that fails or ends reconnects with the same back-off as a run reconnect, as opencode's client does, and fails the panel's connection only when those attempts run out.

`@conciv/ai`: when a run ends while a tool card in the panel still shows running, the panel fetches its history once and the card shows how the call ended.
