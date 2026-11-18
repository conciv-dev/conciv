---
'@conciv/contract': patch
'@conciv/protocol': patch
'@conciv/core': patch
'@conciv/plugin': patch
'@conciv/embed': patch
'@conciv/ui-kit-tap': patch
'@conciv/ui-kit-system': patch
---

Typing `@` in the composer lists the engine's skills, then its agents that are neither primary nor hidden, in one list named `Context` for screen readers, as opencode's composer does. The engine answers them through the new `skill.list` and `agent.list` calls; `meta.tools` and the extension tool list behind the old `Tools` mention list are gone. Each row draws a lucide icon named for its kind (`Skill`, `Agent`) through the new optional `icon` field on a trigger item. The list keeps inside its pane: `AnchoredListbox.Root` takes an optional `boundary` element for its placement, and `RichTextField` passes its `menuBoundary` through, so a list opened near a pane's edge no longer covers the pane beside it.
