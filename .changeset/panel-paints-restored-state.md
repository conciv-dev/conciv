---
'@conciv/embed': patch
---

The widget now paints once its restored navigation state is known, instead of painting a closed launcher and then reopening the panel a moment later when the restore RPC returns. Reopening the panel after a reload or a remount is unchanged; only the visible jump is gone. A restore that arrives after the user has already navigated is now ignored rather than replacing the route they just moved to.
