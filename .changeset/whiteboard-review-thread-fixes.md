---
'@internal/plugin-whiteboard': patch
---

A comment being written closes when the session changes instead of landing in the other session's whiteboard. Live cursors are timed by the server's clock, and opening a thread marks it read up to its newest comment, so a skewed browser clock no longer hides cursors or unread replies. A second finger on another pin no longer cancels the pin being dragged, a pin with its drift prompt open no longer snaps back when pressed, and the agent's cursor always ends where the agent last worked.
