---
'@conciv/cli': patch
---

`conciv init` stopped with Ctrl-C, SIGTERM or SIGHUP while a harness command runs (such as `claude plugin install`) now stops that command too, puts your config back and exits, instead of waiting for the command to finish.
