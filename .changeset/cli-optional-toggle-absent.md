---
'@conciv/cli': patch
---

A tool's optional boolean flag left off the command line no longer reaches the tool as false; the field is left out, as the tool's schema allows.
