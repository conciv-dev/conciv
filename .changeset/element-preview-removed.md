---
'@conciv/ui-kit-chat': patch
'@conciv/unplugin': patch
---

`@conciv/ui-kit-chat/tools` no longer exports `ElementPreview` or the `ELEMENT_CAPTURE_FIXTURE_*` samples, and no longer depends on `rrweb-snapshot`: nothing drew the preview, and the page plugin's stories keep the two samples they use.
