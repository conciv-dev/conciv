---
'@conciv/extension-compiler': patch
'@conciv/plugin': patch
'@conciv/page': patch
'@conciv/extension-page': patch
'@conciv/extension-design': patch
'@conciv/try': patch
---

The Vite plugin stamps JSX with TanStack devtools' own source injector (`addSourceToJsx` from `@tanstack/devtools-bundler-core`) instead of a conciv copy, and every reader (element grab, page tools, highlight, design extension) reads `data-tsd-source`. The conciv-named source attribute is gone. A host that also runs `@tanstack/devtools-vite` gets one attribute per element, since the injector skips elements that already carry one. The `./inject-source` export of `@conciv/extension-compiler` is removed.
