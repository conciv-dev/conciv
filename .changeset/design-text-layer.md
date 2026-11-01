---
'@conciv/extension-design': patch
---

`design_diff` reads the target's text with OCR and compares text as text: identical text drawn by another renderer no longer counts as a pixel difference, and a changed string is a `text` delta on the component that paints it. The x-ray page is redesigned around the component list and the property table.
