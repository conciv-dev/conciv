---
'@conciv/core': patch
'@conciv/plugin': patch
---

The configured engine port is a preference for bundler plugins: when it is already taken the engine
falls back to a free port, logs the address it actually bound, and the page is stamped with that
address, so two dev servers can run at once instead of the second dying on EADDRINUSE. The Next.js
integration still binds its port exactly, because its client learns the address at build time.
