---
'@conciv/plugin-page': patch
---

The page tools attach in a browser without the Navigation API (Firefox before 147, Safari before 26.2): route changes are then not reported until the tab's next report or attach, instead of the attach failing with "Page tools stopped working. Reload the page."
