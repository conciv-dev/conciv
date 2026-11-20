---
'@conciv/plugin-testkit': patch
---

`@conciv/plugin-testkit/node` gains a file-scoped `engine` with settable options, a per-test `freshEngine`, a fresh `session` per test and a `plugin` fixture with `tool(name)` and a typed failure reader. A new `/flow` entry carries the Playwright Test fixtures: `engine`, `host`, `widget` and the rpc fault and wire-observer fixtures, each cleaned up by its fixture. `widgetBundle` defaults to `@conciv/embed`'s built widget, resolved from the Playwright config folder; add `@conciv/embed` as a devDependency or set `widgetBundle`.
