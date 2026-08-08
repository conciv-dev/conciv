---
'@conciv/core': patch
'@conciv/plugin': patch
---

The configured engine port is a preference on the Vite dev server: when it is already taken the
engine falls back to a free port, logs the address it actually bound, and the page is stamped with
that address, so two dev servers can run at once instead of the second dying on EADDRINUSE. The
Next.js integration and the generic webpack/rspack plugin still bind their port exactly, because
both hand the client a fixed address before the engine ever boots.
