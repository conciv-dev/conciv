---
'@conciv/backend-plugin-api': patch
'@conciv/app': patch
'@internal/publish': patch
---

The app no longer provides `@conciv/ui-kit-tap` to plugin bundles: a plugin bundle that imports it now fails to build, as any other kit module does. A plugin's `./plugin-experimental` bundle keeps every field of its default export through to the app, not only `stores` and `setup`. `SetupContext<typeof definition>` types `ui` from the definition's own setup, so `usePlugin<typeof definition>()` sees the components that setup sees. conciv's own first-party plugins get the chat's tool row, error text, truncated text, status dot, JSON view, zoomable image and mention field on `ctx.ui`; third-party plugins keep the documented `ctx.ui`. The whiteboard plugin's thread reply uses the mention field from `ctx.ui`.
