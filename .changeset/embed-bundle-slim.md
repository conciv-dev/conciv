---
'@conciv/embed': patch
'@conciv/core': patch
'@conciv/ui-kit-chat': patch
'@conciv/extension-terminal': patch
'@conciv/skills': patch
---

The widget bundles are now small classic-script loaders over shared, code-split ES chunks in `dist/widget/`, so mermaid, katex, shiki grammars, xterm and the chat highlight worker load only when used, and the IIFE source maps are gone (the embed `dist` drops from 152 MB to about 30 MB). Serve `dist/widget/` next to `conciv-widget.global.js`; the native page serves it automatically.
