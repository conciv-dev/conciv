---
'@conciv/ui-kit-tap': patch
---

An external write to a rich text field no longer throws the caret to the end. The controlled value now
arrives as a ProseMirror transaction that replaces only the differing span, so the editor's own position
mapping carries the selection through it; a restore into an empty field still lands the caret at the end,
a write that spans a trigger chip still flattens it to plain text, and the write still resets the undo
history, so one undo after a restore cannot empty the field.
