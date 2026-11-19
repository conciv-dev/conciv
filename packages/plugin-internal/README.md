# @conciv/plugin-internal

## Purpose

Marks a plugin definition as one of conciv's own first-party plugins, so the app hands its setup more of its own
components on `ctx.ui` than the public `Ui` lists (the chat's tool row, error text, truncated text, status dot, JSON
view, zoomable image, mention field, copy button and disclosure). Third-party plugins never get them: the public `ctx.ui` stays as the SDK
documents it.

## Invariants

- Private, never published. `@conciv/publish` refuses a release where this manifest is not private.
- Not a module the app provides to plugin bundles. Each first-party plugin build inlines it, so the stamp is plain data
  (a string tag and a version) that matches across every inlined copy, never a symbol or an object identity.
- The stamp is made and checked in one file, `src/index.ts`, and nowhere else: plugins stamp through its define
  function, the host checks through its is-check and read functions.
- The tag alone says "first-party"; the version says which shape of the extra members the plugin was built against.
  The host reads the version before it hands the members out and fails that plugin's setup on a version it does not
  know, naming the version it got and the one it expects.
- The extra members' props are shaped for plugins (title, tone, value), not the kits' own props.

## Side effects

None at import. Stamping returns a copy of the definition; the checks only read.
