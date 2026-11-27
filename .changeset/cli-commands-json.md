---
'@conciv/cli': patch
---

The CLI's build writes its command tree (each command's path, description and flags) to `dist/commands.json`, exported as `@conciv/cli/commands.json`, so the docs can list every command from the real tree.
