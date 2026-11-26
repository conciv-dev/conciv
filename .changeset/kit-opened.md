---
'@conciv/simulation': patch
'@conciv/app': patch
---

A test sees what the engine opened in the editor: `engine.opened()` lists each file asked for (with its line and column when given), in the order asked, in node, happy-dom and browser mode.
