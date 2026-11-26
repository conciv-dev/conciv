# @conciv/backend-plugin-api

The conciv engine plugin API: `Plugin.define` for a plugin's engine part, the rpc
contract helpers, and the tool and context types a plugin author imports. The browser part of a plugin is written
against `@conciv/frontend-plugin-api`. Public and stable, no implementation: the machinery behind it is
`@conciv/backend-app-api`.

Part of [conciv](https://github.com/conciv-dev/conciv).

- Source, examples and details: [src](./src/README.md).

## Invariants

- ESM only (`type: module`).

## Side Effects

- None at import. `./host` reads plugin folders and imports their entry files when the host calls it.
