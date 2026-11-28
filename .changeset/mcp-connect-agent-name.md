---
'@conciv/cli': patch
---

Command-line mistakes now come from the cli error catalog with plain messages: a missing argument or flag says what to pass, from the argument's own description (`url: missing; pass the page URL to log in, for example http://localhost:3001/`), and a value it does not accept says the same instead of zod's raw text. `conciv mcp connect`, `disconnect` and `serve` no longer print the `<AGENT>` placeholder and accept only the agents that have a conciv hub connection.
