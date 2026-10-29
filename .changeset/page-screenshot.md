---
'@conciv/extension-page': patch
---

Add `page_screenshot`: captures the visible viewport as a webp image through snapdom (lazy-loaded on first call), hands the model an image part plus its size, and shows the picture in the read card.
