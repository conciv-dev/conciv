---
'@conciv/ui-kit-chat': patch
---

ModelSelector no longer drops keystrokes typed right after the trigger is tapped. The combobox open
state is owned by the machine unless a consumer passes `open`, so the list opens in the same turn as
the trigger activation instead of after a round trip through Solid.
