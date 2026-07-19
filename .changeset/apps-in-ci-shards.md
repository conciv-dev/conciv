---
'@conciv/extension': patch
---

`defineAttachment().card()` now types its component as `Component<AttachmentCardProps>` instead of a bare
`Component`, so extension authors can read the `remove` element the composer hands the card without
re-declaring the prop type by hand.
