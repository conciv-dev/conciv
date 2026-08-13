---
'@conciv/cli': patch
---

`conciv init` now teaches agents the MCP discovery workflow (`await external_catalog({})`) instead of a static AGENTS.md command list. It also offers an opt-in docs pack step during plan review — declined by default, `--yes` never enables it — that adds `@conciv/skills` as a dev dependency and runs `@tanstack/intent install` for setup, extension-authoring, and debugging guidance.
