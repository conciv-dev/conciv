---
'@conciv/backend-app-api': patch
'@conciv/backend': patch
---

`conciv plugin call server config` prints the attached dev server's resolved root, base, mode, aliases and plugins, and `conciv plugin call server urls` prints where it listens. `conciv plugin call server resolve --data '{"spec":"./app","importer":"/src/main.ts"}'` prints where an import resolves, `conciv plugin call server graph --data '{"file":"/src/app.ts"}'` prints a module's importers and imports, and `conciv plugin call server transform --data '{"url":"/src/app.ts"}'` prints the code the dev server serves for that url. There is no terminal restart command: restarting asks, so it is the agent's `server_restart` tool only, and it asks first; restart your own dev server in your terminal. `conciv plugin call server open --data '{"file":"src/app.ts","line":7}'` opens a file in your editor, at a line and column when given. With no dev server attached each dev server method fails with `no dev server is attached to conciv` (`BUNDLER_UNAVAILABLE`), and when the dev server itself fails a resolve, graph or transform, the method fails with `BUNDLER_FAILED` and the dev server's own message in its data.
