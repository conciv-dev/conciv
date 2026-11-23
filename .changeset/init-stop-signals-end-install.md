---
'@conciv/cli': patch
---

`conciv init` stops its package install and restores your config on SIGTERM and SIGHUP as well as Ctrl-C, exits with 128 plus the signal number (130, 143, 129), and kills the install if init exits while it runs.
