---
'@conciv/cli': patch
---

`conciv init` now teaches agents the MCP discovery workflow (`await external_catalog({})`) instead of a static AGENTS.md command list. It also offers an opt-in docs pack step during plan review — declined by default, `--yes` never enables it — that adds `@conciv/skills` as a dev dependency and runs `@tanstack/intent install` for setup, extension-authoring, and debugging guidance.

The interactive wizard was reworked to a single-pass flow, modeled on the TanStack CLI: it asks the harness, framework, and docs-pack questions once, renders one plan, and asks for one confirmation — declining cancels outright instead of dropping into an edit loop. The execution phase now streams each step's live command output through clack's `taskLog`, instead of buffering it behind a spinner until the step settles.
