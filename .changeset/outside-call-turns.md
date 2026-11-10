---
'@conciv/ui-kit-chat': patch
---

Each outside agent call is now its own turn in the chat panel, so a tab driven by an outside agent no longer grows one ever larger turn the panel can never unload. Consecutive outside calls still read as one open list: no fold, no message actions, one continuous trace line.
