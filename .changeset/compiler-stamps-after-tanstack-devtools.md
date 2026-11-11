---
'@conciv/extension-compiler': patch
'@conciv/plugin': patch
---

The conciv vite plugin stamps `data-conciv-source` on JSX even when `@tanstack/devtools-vite` already stamped the file with `data-tsd-source`. Before, a host with TanStack devtools got no conciv source attributes at all.
