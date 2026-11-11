---
'@conciv/extension-compiler': patch
'@conciv/plugin': patch
---

Every host JSX element the conciv vite plugin stamps now also carries a stable `data-conciv-key`, and a component imported from outside the framework carries `data-conciv-site="<file>:<line>"` at its call site. Keys are never written into your files: a key already in the source is kept, otherwise one is minted from the file path, element index and file text, and the dev server carries it across edits to the file, so the server and client renders agree and an element keeps its key while other lines or its own attributes change.
