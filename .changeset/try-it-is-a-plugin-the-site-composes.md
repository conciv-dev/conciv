---
'@conciv/plugin-try-it': patch
'@conciv/embed': patch
'@conciv/app': patch
'@conciv/plugin': patch
---

try-it is now its own plugin, `@conciv/plugin-try-it`, that a host composes into the widget: `mountConciv(extensions, [[entry, {token}]])` or `createConciv({plugins})` hands each plugin its options as `ctx.options`. Mounted without an `apiBase`, the widget runs in servers mode: plugins start before any core exists, a plugin's `Server` entry covers the panel with its `cover` while it is not ready (the panel stays mounted underneath, inert), and the widget binds to the entry's `http.url` once it turns ready. try-it's entry covers the panel with the connect steps until the visitor's local core answers. The connect-mode Disconnect button is gone.
