---
'@conciv/embed': patch
---

Make the widget panel usable at phone widths. Below a 520px viewport the floating modal now becomes a full-bleed sheet (`inset-0`, edge to edge) instead of a small clipped card, driven by a reactive media query so the stored `conciv-modal-width`/`-height` prefs and resize handles no longer fight the breakpoint. The sheet pads with `env(safe-area-inset-*)` via a new `pad-safe` preset shortcut so the header and composer clear the notch, status bar, and home indicator when the native page runs under `viewport-fit=cover`. Long inline code tokens now wrap (`overflow-wrap: anywhere` in the typography preset) instead of clipping, and code blocks keep their own horizontal scroll, so tool cards, code blocks, and the composer produce no horizontal overflow at 320/375/393/430px in both light and dark. While the full-screen sheet is open the launcher mascot is hidden so it no longer covers the composer; the panel is closed via its header control.
