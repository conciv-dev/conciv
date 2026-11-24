---
'@conciv/plugin-terminal': patch
---

The terminal connects, and reconnects after a dropped connection, only once its screen is at least two rows and two columns, so a panel shrunk to one row while the connection drops reopens when it grows again instead of failing. A screen wider or taller than 500 cells fits at 500, and a resize is sent only for a size the engine takes.
