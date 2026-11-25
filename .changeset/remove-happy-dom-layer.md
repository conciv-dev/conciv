---
'@conciv/plugin-testkit': patch
'@internal/frontend-defaults': patch
'@conciv/ui-kit-system': patch
---

The happy-dom test layer is gone: plugin-testkit no longer exports `./browser` or `./dom-environment`, and the app and ui-kit-system have no happy-dom test project.
