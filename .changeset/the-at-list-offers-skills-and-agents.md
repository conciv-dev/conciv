---
'@conciv/contract': patch
'@conciv/protocol': patch
'@conciv/core': patch
'@conciv/plugin': patch
'@conciv/embed': patch
'@conciv/ui-kit-tap': patch
'@conciv/ui-kit-system': patch
---

Typing `@` in the composer lists the engine's skills, then its agents that are neither primary nor hidden, then the session's tools from `meta.tools`, in one list named `Context` for screen readers. The engine answers skills and agents through the new `skill.list` and `agent.list` calls. Each row draws a lucide icon named for its kind (`Skill`, `Agent`) through the new optional `icon` field on a trigger item. The list keeps inside its pane: `AnchoredListbox.Root` takes an optional `boundary` element for its placement, and `RichTextField` passes its `menuBoundary` through, so a list opened near a pane's edge no longer covers the pane beside it.
