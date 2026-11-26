---
'@internal/frontend-defaults': patch
---

A plugin's tool card view is now drawn inside the normal card for that call, so its header reads as the normal card's: the catalog title with the positional value (for example `report where an import specifier resolves solid-js`), the badge and the timing. When the tool catalog arrives after the card is on screen, the card becomes the catalog card and the plugin is not asked to draw again.
