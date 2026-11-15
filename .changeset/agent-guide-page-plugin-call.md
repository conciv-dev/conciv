---
'@conciv/harness-init': patch
---

The conciv section `conciv init` writes to AGENTS.md now teaches the page commands as `conciv plugin call experimental.page run --data '{"sessionId":"<sessionId>","action":{...}}'`, one action per command, in place of the old `conciv page ...` and `conciv tools react ...` commands. Re-render tracking shows the plain report and, as its own command, the report for one component. A project gets the new guide the next time `conciv init` runs.
