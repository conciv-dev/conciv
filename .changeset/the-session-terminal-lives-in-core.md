---
'@conciv/backend': patch
'@conciv/protocol': patch
'@conciv/backend-plugin-api': patch
---

The session terminal moves into core. The contract gains `experimental.persistentPty.create`, which opens the session's terminal or returns the one already open, `remove`, which closes it, and `connectToken`, which mints a ticket for the socket at `/api/experimental/persistent-pty/:ptyId/connect`.

Outside agents are refused. A ticket is bound to the pty it was minted for and to the Origin that minted it, so it cannot open another pty or be used from another page.

Plugins reach these procedures through `ctx.client.experimental`.
