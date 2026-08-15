---
'@conciv/extension-terminal': patch
---

the terminal extension is created through `createTerminalExtension({openTerminal})`, so the host that spawns the terminal window is injectable; the default export is unchanged
