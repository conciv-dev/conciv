---
'@conciv/plugin-testkit': patch
---

The happy-dom project inlines the page's Solid, Ark, Zag and lucide packages by package name, so a checkout whose path holds one of those words no longer inlines every dependency and fails to start with "require is not defined".
