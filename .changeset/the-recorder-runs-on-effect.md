---
'@conciv/plugin-recorder': patch
---

The recorder plugin runs on Effect on both halves. Exporting a video and starting a new recording no longer run at the same time, a flush asked for while a failed send waits to retry now waits for that retry, and a video that cannot be read answers a typed `unreadable` error instead of an internal error.
