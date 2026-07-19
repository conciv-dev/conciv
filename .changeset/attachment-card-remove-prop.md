---
'@conciv/extension': patch
---

`defineAttachment().card()` now accepts `Component<AttachmentCardProps>` instead of a props-less `Component`. It was already stored and rendered as `Component<AttachmentCardProps>`, so custom attachment cards were handed a `remove` element they could not type against — leaving them with no remove affordance in the composer chip area.
