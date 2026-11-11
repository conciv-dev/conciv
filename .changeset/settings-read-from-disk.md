---
'@conciv/core': patch
---

Settings reads now check the saved file, so a change another engine saved to the shared global settings is visible on the next read instead of waiting for a file-system watch event. An unreadable file on a later read keeps the settings already in memory.
