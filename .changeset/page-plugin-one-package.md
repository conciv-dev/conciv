---
'@conciv/plugin-page': patch
'@conciv/client': patch
'@conciv/backend': patch
'@conciv/app': patch
---

The page plugin is one package, `@conciv/plugin-page`: `@conciv/page` (the DOM helpers) is merged into it as
`@conciv/plugin-page/client`, and the window part the built-ins ran is `@conciv/plugin-page/renderer`. `@conciv/page` is no longer published.
