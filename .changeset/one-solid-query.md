---
'@conciv/client': patch
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

The widget and every extension now share one TanStack Query copy, bundled inside `@conciv/client` and patched for TanStack/query#11230, so a background refetch no longer steals focus from the model search or the composer in host apps. The terminal's model picker reads the same cached model list as the composer.
