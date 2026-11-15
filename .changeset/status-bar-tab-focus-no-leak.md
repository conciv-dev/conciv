---
'@conciv/app': patch
---

Focusing a status bar tab no longer leaves a computation behind. Before, each focus on a tab created a memo with no owner that stayed subscribed to the view lock for as long as the bar was open.
