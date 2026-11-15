---
'@conciv/core': patch
'@conciv/client': patch
'@conciv/ai': patch
---

Plugin permission cards now behave reliably at the edges:

- Stopping a run also ends any permission card a plugin tool raised inside `execute_typescript`. Approving that card afterwards runs nothing and clears the card.
- Closing the engine clears pending permission cards from storage before the database closes, so no card is left behind for the next start.
- Answering a card that another window already answered, or a card left over after a stopped run, now just removes the card. The widget no longer shows "That permission request is no longer waiting for an answer."
- A card that arrives or is answered while the chat is reloading its history no longer disappears or comes back.
- A session whose saved permission rules cannot be read keeps its built-in tools but is offered no plugin tools. It still opens and lists normally, and the engine log names the session.
