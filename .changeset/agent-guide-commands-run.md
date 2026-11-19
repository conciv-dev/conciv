---
'@conciv/harness-init': patch
'@conciv/cli': patch
---

The conciv section `conciv init` writes to AGENTS.md (and the Claude plugin's conciv skill) now teaches commands that run as written: `tools react find --name <ComponentName>` instead of `react find <ComponentName>`, and tracking as `tools react track --action start`, reproduce, `--action report [--name <ComponentName>]`, then `--action stop`, instead of `react track <selector>`. `react inspect` and `page eval` now show the argument each one needs. A project set up before this keeps the old text until you run `npx @conciv/cli@latest init` again, which replaces the marked conciv section.

The dev server's `graph` method (`conciv plugin call server graph`) with a path relative to the project (`src/routes/index.tsx`) or a `/src/...` url now finds the module; before, only an absolute path did, and anything else answered an empty graph. A path that matches no module now fails with `no module for <file> in the dev server's module graph` instead of an empty success.
