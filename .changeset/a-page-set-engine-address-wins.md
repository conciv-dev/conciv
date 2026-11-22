---
'@conciv/unplugin': patch
---

An engine address the host page sets as `window.__CONCIV_API_BASE__` before the widget starts now wins over the address the vite, webpack, rspack and Next.js plugins give it, as the documented order says (page global, then the meta tag, then `?core=`).
