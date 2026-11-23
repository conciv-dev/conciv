---
'@conciv/plugin': patch
---

`ctx.ui` is one opaque object (`OpaqueUi`, as Backstage's opaque types): its public type is `Ui`, unchanged for every plugin, and conciv's own plugins read conciv's members (`BasicTool`, `ErrorMessage`, `TruncatedText`, `StatusDot`, `Json`, `Image`, `MentionField`, `CopyButton`, `Collapsible`) with `OpaqueUi.toInternal(ctx.ui)`. The first-party plugin stamp and `@conciv/plugin-internal` are gone. The published SDK types name no private package.
