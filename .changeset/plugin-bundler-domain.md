---
'@conciv/backend-plugin-api': patch
---

A plugin registers its bundler hooks through `ctx.bundler.transform((editor) => editor.add({transform, resolveId, load}))` inside its `effect` (or `setup` on the promise entry), so the hooks can reach state the plugin creates there. The registration lives with the plugin's scope and goes when the plugin stops or reloads. The static `bundler` property on the plugin definition is gone.
