---
'@conciv/backend-plugin-api': patch
'@conciv/unplugin': patch
---

A plugin can reach the host's dev bundler: inside its `effect` (or `setup` on the promise entry) it registers `transform`, `resolveId` and `load` hooks with `ctx.bundler.transform((editor) => editor.add({transform, resolveId, load}))`, so the hooks can use state the plugin creates there. In dev, `@conciv/unplugin` runs them after its own source stamp, in plugin load order; a registration goes when its plugin stops or reloads.
