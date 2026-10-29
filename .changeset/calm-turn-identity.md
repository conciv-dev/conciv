---
'@conciv/ui-kit-chat': patch
---

A settled turn keeps its identity when the server re-broadcasts the transcript. The run-start history snapshot re-mints assistant message ids, which changed the turn key and made the thread destroy and rebuild that row: the settled answer replayed its entrance animation and slid under the reader. Turn reuse now compares a turn's messages by value, so a re-keyed snapshot of the same conversation leaves the rendered turn untouched.
