---
'@conciv/plugin': patch
'@conciv/plugin-ios': patch
---

A plugin's app part gets `ctx.widget.open()`, `ctx.widget.close()` and a reactive `ctx.widget.isOpen()`, which open and close the widget's panel the way its launcher does (login first when the engine asks for one, focus given back on close, a docked widget stays open). `isOpen()` follows the panel as the launcher shows it. The ios plugin opens, closes and reads the panel through it instead of the panel event bus.
