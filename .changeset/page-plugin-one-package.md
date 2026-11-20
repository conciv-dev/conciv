---
'@conciv/plugin-page': patch
'@conciv/client': patch
'@conciv/core': patch
'@conciv/embed': patch
---

The page plugin is one package, `@conciv/plugin-page`: `@conciv/page` (the DOM helpers) is merged into it as
`@conciv/plugin-page/client`, the window part the built-ins ran is `@conciv/plugin-page/renderer`, and the fake page tabs
for tests are `@conciv/plugin-page/testing`. `@conciv/page` is no longer published.
