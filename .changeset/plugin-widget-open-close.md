---
'@conciv/plugin': patch
'@conciv/plugin-ios': patch
---

A plugin's app part gets `ctx.widget.open()` and `ctx.widget.close()`, which open and close the widget's panel the way its launcher does (login first when the engine asks for one, focus given back on close, a docked widget stays open). Whether the panel is open is `ctx.router.path()` on a `/panel` route. The ios plugin opens and closes the panel through it instead of the panel event bus.
