---
'@conciv/plugin': patch
'@conciv/core': patch
'@conciv/plugin-page': patch
'@conciv/plugin-terminal': patch
'@conciv/unplugin': patch
---

No package has its own `turbo.json`, `build:types` or `kit-runtime` task any more: every package builds and tests through the root `turbo.json`. The engine tests of chat, plugin-host and the plugin SDK live in `@conciv/core`, which starts the engine they need. `@conciv/grab` and `@conciv/ui-kit-terminal` are gone: the grab labels live in the page plugin, the terminal screen in the terminal plugin, and the `GrabPicker` registry is the only way a picker is supplied. The SDK client's event stream is opencode's `SharedEvents` with nothing around it, and a stream that ends ends; `createClientConnection` (`@conciv/plugin/experimental/host`, opencode's `client/src/solid/connection.ts`) keeps one reader open, reconnects it and reports `status()`. A plugin's browser bundle may inline another plugin's `/contract` export, and the page plugin's React fiber, tree, locate and operation types move to `@conciv/plugin-page/contract`. The terminal plugin draws through `ctx.ui`. `@conciv/plugin-terminal` is published and is a served plugin (`./plugin-experimental` only, id `@conciv/plugin-terminal`); the dev server lists it in every engine's plugins, and the widget no longer bundles it. The SDK's `@conciv/plugin/experimental/page` also exports `SourceLocSchema` and `RawFrameSchema`, and a served plugin's bundle no longer inlines `@conciv/contract`.
