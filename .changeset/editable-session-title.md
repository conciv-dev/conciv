---
'@conciv/app': patch
'@conciv/ui-kit-system': patch
---

The panel header title now opens the session menu as a hover card: hovering the title opens it, and clicking or pressing Enter or Space opens it right away. It stays open while focus or the session list is inside it, and closes on Escape, an outside click, or when the pointer leaves. A pencil next to the title renames the session in place (Enter or blur saves, Escape cancels). The separate options button and the rename control inside the session list are gone. `@conciv/ui-kit-system` gains an `Editable` wrapper over Ark UI Editable, and `HoverCard` is now a compound (`HoverCard.Root`, `Trigger`, `Positioner`, `Content`) so callers can control `open` and positioning.

Tooltips no longer replay their pop-in animation when the pointer leaves the trigger, so a closing tooltip fades away instead of flickering.
