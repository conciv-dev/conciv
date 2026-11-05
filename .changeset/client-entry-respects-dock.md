---
'@conciv/extension-compiler': patch
---

A page that runs conciv in the Vite DevTools dock no longer gets a second widget when one of its modules is a framework client entry: the page module stays out when the page declares the dock surface.
