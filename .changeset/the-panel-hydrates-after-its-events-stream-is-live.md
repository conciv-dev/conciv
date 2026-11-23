---
'@conciv/client': patch
'@conciv/ai': patch
---

`@conciv/client`: the panel fetches its history once, after its chat events stream is live, so nothing that happens while it opens is missed, and after the stream drops and comes back the panel fetches its history again and shows what happened meanwhile.

`@conciv/ai`: when a run ends while a tool card in the panel still shows running, the panel fetches its history once and the card shows how the call ended.
