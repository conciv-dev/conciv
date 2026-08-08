---
'@conciv/ui-kit-system': patch
---

The widget composer is always mounted and no longer waits on a round-trip: the saved draft, its grabs and its caret hydrate into the live editor when they arrive, and anything typed in the meantime wins. Panel open focuses the composer once it is actually attached, so a slow load no longer swallows the focus.

The slash and mention menus get their grouped source headers and per-command descriptions back, rebuilt on the design system's Ark listbox instead of a hand-rolled list, and the trigger layer that drives them — categories, drill-down, Back and the shared keyboard model — is restored next to the rich text field. TipTap's suggestion plugin stays the only thing that detects a trigger, so chips remain the one grammar.

An open panel no longer takes focus or selection from the page it sits on. It only claims focus that landed nowhere, or that it was handed when the page opened it, and the floating card no longer traps the keyboard — only the full-screen phone sheet, which is modal, still does.
