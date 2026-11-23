# @internal/builtin-plugins

Private, never published, inlined into the builds that use it: the app's built-in plugins as one composed list, so
the app names no plugin (as opencode's `@opencode/gui-plugins/renderer`).

- `src/index.ts`: `builtins`, the page and terminal plugins composed with the SDK's `compose`, each with an eager
  window entry. The app adds its own `grab` entry next to it and hot-reloads the list as a whole.

Invariants: this is the only place the app's build names a built-in plugin. `assertPublicSet` keeps the package
private, and `assertPublicTypesPublic` fails when a public package's built types name it.
