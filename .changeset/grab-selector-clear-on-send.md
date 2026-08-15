---
'@conciv/embed': patch
---

Grab reference cards clear the moment a message is sent and are restored if the send fails. The staged-grabs strip
sizes to its content by default and resizes via a pill grabber on its top edge (the shared createResizable, which
gained an optional max bound and no longer requires a storage key); previews scale to the card like images through
an svg viewBox, capped at 40% of the panel height. The panel minimum height rises to 400px and the composer keeps
priority at any panel size.
