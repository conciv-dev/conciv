---
'@conciv/plugin-ios': patch
---

The iOS plugin runs xcrun, swiftc, plutil and codesign through the host's process spawner, reads and writes its build files through the host's file system, and runs one build at a time. A command that cannot start, or that prints more than 128MB, now answers with a tool error instead of a failed build or run.
