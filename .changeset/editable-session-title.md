---
'@conciv/app': patch
'@conciv/ui-kit-system': patch
---

Clicking the panel header title, or pressing Enter or Space on it, opens the session menu: the session switcher, context usage and the refresh, pop-out and disconnect rows. Escape or an outside click closes it and returns focus to the title. A pencil next to the title renames the session in place (Enter or blur saves, Escape cancels). The separate options button and the rename control inside the session list are gone. `@conciv/ui-kit-system` gains an `Editable` wrapper over Ark UI Editable.

Tooltips no longer replay their pop-in animation when the pointer leaves the trigger, so a closing tooltip fades away instead of flickering.
