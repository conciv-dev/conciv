---
'@conciv/unplugin': patch
---

The vite widget boot script is served at `/@conciv/widget.js` (and `/@conciv/widget-dock.js` in the Vite DevTools dock) instead of `/@conciv/extensions.js`. The unplugin owns its vite hook plumbing (the Solid dedupe and optimizeDeps config and the JSX source stamping) and no longer depends on `@conciv/extension` or `@conciv/extension-compiler`. The hosts no longer load extensions: the extensions entry and its watcher, the `@conciv/app-extensions` alias and the extensions virtual module are gone. Plugins, from `plugins` or `conciv/plugins`, replace them.
