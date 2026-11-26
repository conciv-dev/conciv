# @conciv/backend-app-api

The machinery behind `@conciv/backend-plugin-api`, in Effect: the plugin host (loading, supervising and updating
plugins), the hook registry, the tool service and permissions, sessions, config and the engine database layers that
`@conciv/backend-defaults` builds the engine from.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Invariants

- Plugins never import this package: a plugin author imports `@conciv/backend-plugin-api` only. Its one workspace
  dependent is `@conciv/backend-defaults` (`packages/backend-defaults/package.json`).
- `package.json:type` - ESM only; the `attw` script checks the `esm-only` profile.
