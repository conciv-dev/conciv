---
'@conciv/extension-page': patch
---

Page is a built-in extension end to end: every page verb is a `defineTool().client(body)` declaration dispatched by name through the registry over the final `{requestId, name, input}` wire envelope. The page-only vocabulary (kind enum, field-bag, `page.run`, ext verbs, `PageVerbMap`) is gone, the CLI derives `conciv page`/`conciv react` from the live catalog, mutating page calls prompt for approval on every surface, and the TanStack extension reaches its own browser verbs through the same registry path.
