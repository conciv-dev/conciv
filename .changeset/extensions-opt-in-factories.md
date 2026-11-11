---
'@conciv/it': patch
'@conciv/plugin': patch
'@conciv/protocol': patch
'@conciv/core': patch
'@conciv/extension': patch
'@conciv/extension-compiler': patch
'@conciv/extension-design': patch
'@conciv/extension-ios': patch
'@conciv/extension-recorder': patch
'@conciv/extension-terminal': patch
'@conciv/extension-test-runner': patch
'@conciv/extension-whiteboard': patch
---

Extensions are opt-in. `@conciv/it` no longer installs any extension: add the ones you want by importing them and
passing them to the plugin, for example `conciv({extensions: [whiteboard(), design({comparator: 'pixelmatch'})]})`,
or `withConciv(nextConfig, {extensions: [terminal()]})` on Next.js. Each extension package's default export is now a
function that takes that extension's options, and the name-keyed `extensions: {design: {...}}` option is gone. The
server extension object moved to each package's `/server` subpath.
