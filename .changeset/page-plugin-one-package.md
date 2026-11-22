---
'@conciv/plugin-page': patch
'@conciv/client': patch
'@conciv/core': patch
'@conciv/embed': patch
---

The page plugin is one package, `@conciv/plugin-page`: `@conciv/page` (the DOM helpers) is merged into it as
`@conciv/plugin-page/client`, and the window part the built-ins ran is `@conciv/plugin-page/renderer`. `@conciv/page` is no longer published.
