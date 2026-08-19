---
'@conciv/mascot': patch
---

Pin `force3D: true` on the continuous work-loop tweens (bob, throb, blink and their pose recovery/handoff) so the browser keeps one stable compositor layer for the head, eyes and antenna instead of gsap's `force3D: 'auto'` flipping the transform representation tick to tick while concurrent tweens hit the same element.
