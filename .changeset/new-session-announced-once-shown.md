---
'@conciv/app': patch
---

Starting a new session announces "Started a new session" only once the new session is on screen. Before, the announcement came while the previous session was still showing, so a model menu opened right then belonged to the old session and closed by itself when the new one appeared.
