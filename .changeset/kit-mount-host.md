---
'@conciv/plugin-testkit': patch
---

`mount` takes the host's settings as `host` (the plain data a host page passes to `conciv({...})`: `defaultOpen`, `launcher`, `surface`, `modal`, `quickTerminal`) and hands them to the app as the embed does.
