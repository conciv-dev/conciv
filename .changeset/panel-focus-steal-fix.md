---
'@conciv/embed': patch
---

The panel's composer-focus effect no longer steals focus from the host page. A restored open panel (page load, session switch, or FAB open) now checks whether a host-page element currently holds focus and skips the composer focus claim when it does, so a host input with `autofocus` keeps focus across widget boot. Opening the panel while focus is inside the widget itself (for example clicking the FAB) still focuses the composer as before.
