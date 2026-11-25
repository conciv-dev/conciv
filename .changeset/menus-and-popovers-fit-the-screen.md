---
'@conciv/ui-kit-system': patch
'@internal/frontend-defaults': patch
---

Menus and popovers fit the space the screen has. On a short screen the composer pill menus, the Notes popover and the model menu no longer run off the top: their heading and first row stay in view and the list scrolls. The kit `Menu` and `Popover` turn on zag's `fitViewport` by default, the kit `Positioner` is a flex column, and the content shrinks inside it, so each menu's own `max-h` stays the upper bound. On a short screen the hovered session's preview fits and its newest entry stays in view. At normal sizes nothing moves.
