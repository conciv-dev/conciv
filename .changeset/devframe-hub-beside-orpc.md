---
'@conciv/client': patch
'@conciv/core': patch
'@conciv/embed': patch
'@conciv/extension': patch
'@conciv/extension-compiler': patch
'@conciv/plugin': patch
'@conciv/protocol': patch
'@conciv/serve': patch
---

Run a Devframe hub beside oRPC in the engine, with `defineConcivFunction`, `defineConcivPlugin` and connection helpers, and forward it on the page origin of every dev server (Vite, Next.js, webpack and Rspack). Nothing changes for users yet.
