---
'@conciv/ui-kit-system': patch
---

`Dialog` now also exports its parts (`Dialog.Root`, `Dialog.Portal`, `Dialog.Backdrop`, `Dialog.Positioner`, `Dialog.Content`, `Dialog.Header`, `Dialog.Title`, `Dialog.Body`, `Dialog.Footer`, `Dialog.CloseTrigger`, plus Ark's `Dialog.Trigger` and `Dialog.Description`), so you can compose a dialog with a close button or your own layout and still get the kit's look and its shadow-root mounting. The ready-made `Dialog` works and looks exactly as before.
