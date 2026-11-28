---
'@conciv/app': patch
'@conciv/ui-kit-chat': patch
---

Less JavaScript before the panel opens: the widget shell's routes (the chat session, settings, quick terminal, pop-out and connect screens) now load on first use through TanStack Router code splitting, with the loading pane showing inside the panel while a screen loads. `@conciv/ui-kit-chat` now ships one file per module and marks itself free of side effects, so importing one of its parts no longer pulls in the whole kit.
