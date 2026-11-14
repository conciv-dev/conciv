---
'@conciv/embed': patch
---

Test tooling only, nothing in the shipped packages changes: the chat pane's perf gate (`pnpm --filter @conciv/app test:perf`) now takes five samples per case and compares a branch against the merge base with `origin/main`, measured in the same session.
