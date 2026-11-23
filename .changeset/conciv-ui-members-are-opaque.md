---
'@conciv/plugin': patch
---

`ctx.ui` is one opaque object: its public type is `Ui`, unchanged for every plugin, and the SDK exports no opaque definition. Conciv's own plugins read conciv's members (`BasicTool`, `ErrorMessage`, `TruncatedText`, `StatusDot`, `Json`, `Image`, `MentionField`, `CopyButton`, `Collapsible`) through the private `@internal/plugin`. The first-party plugin stamp is gone, and no published SDK type names a private package.
