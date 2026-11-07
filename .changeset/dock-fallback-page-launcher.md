---
'@conciv/plugin': patch
'@conciv/extension-compiler': patch
---

Show the page launcher on server-rendered Vite hosts (TanStack Start and others whose html skips `transformIndexHtml`) when Vite DevTools is installed. The dock module and dock settings now travel only with `transformIndexHtml`, the same pipeline Vite DevTools uses to inject its dock, so a page that never gets the dock keeps the floating launcher.
