---
'@conciv/embed': patch
'@conciv/app': patch
'@conciv/unplugin': patch
'@conciv/react': patch
'@conciv/preact': patch
'@conciv/solid': patch
---

The widget no longer mounts old SDK extensions. Their panel views, view lock, status, composer and empty slots, slash commands, tool cards, attachment cards and page-level `Surface` are gone, and so are the Views settings tab (with its hide, pin and order preferences and Reset views) and the generated extension settings pages (with Reset extension settings). Plugins add that UI through the plugin registries.

`createConciv` no longer takes `extensions` (`ConcivInit.extensions` and the `ExtensionsInput` type are removed), and `mountConciv(plugins?)` takes plugin entries as its only argument. The React, Preact and Solid wrappers drop their `extensions` prop. The `virtual:conciv-extensions` module from `@conciv/extension-compiler` mounts the widget with no extensions, and the package drops its `./dedupe` export and the server-side extension loaders.
