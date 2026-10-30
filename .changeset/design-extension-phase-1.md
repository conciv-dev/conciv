---
'@conciv/extension-design': patch
'@conciv/it': patch
'@conciv/cli': patch
'@conciv/embed': patch
'@conciv/harness-init': patch
'@conciv/extension-page': patch
---

New built-in design extension, mounted by `@conciv/it`: register a design image as the target of a route at a width, then `conciv tools design diff` compares the live page with it and ranks the components that differ, with the deltas and the source that sets them. `conciv tools design status` says when every registered width matches. The agent guide written by `conciv init` describes the loop.
