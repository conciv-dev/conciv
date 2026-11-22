---
'@conciv/plugin-testkit': patch
---

A test file that makes no engine no longer loads the engine: the kit's setup file imports only the list of file-level engines, which cuts about a second from every node and happy-dom worker start.
