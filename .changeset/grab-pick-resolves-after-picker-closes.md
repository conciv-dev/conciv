---
'@conciv/plugin-page': patch
---

A grab resolves only once the element picker has closed, so the composer takes focus after the picker hands focus back to where it was, whatever the speed of the element capture.
