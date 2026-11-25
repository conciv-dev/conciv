---
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
---

The model pill and the Terminal toolbar take their height from their content: padding around the text line, no fixed height, so every state (loading, failed, ready) lays out the same in every browser.
