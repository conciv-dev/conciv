---
'@conciv/backend': patch
---

A message sent while the session's turn is still preparing its prompt (a plugin's `prompt` hook still running) now ends only that older turn and is answered. Before, the older turn, once its preparation finished, ended the newer one as well, so neither turn answered. A turn now ends only the turns that started before it, and a turn that a newer one already ended ends none.
