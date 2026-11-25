---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

`engine.event(type, {data})` waits for the first event of that type whose data matches the given partial data, in node and browser mode.
