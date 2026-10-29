---
'@conciv/core': patch
---

Sweep the Bash approval gate's read-only command set for flags that write or execute despite a read-only head: `rg --pre` / `--hostname-bin` and `grep --filter` / `--pager` / `--view` / `--save-config` / `--config` all run a command or write a file, and `date` forms that set the system clock now ask. The per-head vetoes are consolidated behind one `escapesReadOnlyIntent` rule table.
