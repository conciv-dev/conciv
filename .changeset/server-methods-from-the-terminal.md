---
'@conciv/plugin-host': patch
---

`conciv plugin call server config` prints the attached dev server's resolved root, base, mode, aliases and plugins, and `conciv plugin call server urls` prints where it listens. `conciv plugin call server resolve --data '{"spec":"./app","importer":"/src/main.ts"}'` prints where an import resolves, `conciv plugin call server graph --data '{"file":"/src/app.ts"}'` prints a module's importers and imports, and `conciv plugin call server transform --data '{"url":"/src/app.ts"}'` prints the code the dev server serves for that url. `conciv plugin call server restart --data '{}'` restarts the dev server (`{"force":true}` for a full restart) without asking, as the terminal is the owner; the agent's `server_restart` still asks first. With no dev server attached each fails with `no dev server is attached to conciv`.
