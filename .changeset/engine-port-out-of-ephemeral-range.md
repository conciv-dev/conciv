---
'@conciv/unplugin': patch
---

The default engine port on Next.js, webpack and Rspack is now 24170. The old default, 41700, sat inside Linux's ephemeral port range (32768-60999), so an outgoing connection could hold it and the engine failed to start at random with `EADDRINUSE`. If you pinned the port with `port`, nothing changes for you.
