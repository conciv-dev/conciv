---
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-chat': patch
---

`ComposerActions.ActionButton` passes extra props such as `data-*` and `aria-*` attributes to its button, and to its overflow menu item when the action collapses. `TextField` gains an `outline` variant (32px, panel background) that keeps the filled field's focus, invalid, disabled and read-only states.
