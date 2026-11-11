---
'@conciv/ui-kit-chat': patch
---

Each outside agent call is now its own turn in the chat panel, so a tab driven by an outside agent no longer grows one ever larger turn the panel can never unload. Consecutive outside calls still read as one open list with no fold and one continuous trace line; under the last call of the list a Copy action copies the calls (no Retry).
