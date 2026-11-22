---
'@conciv/plugin-testkit': patch
---

The happy-dom environment gives the page a `navigation` that fires `currententrychange` when the history is pushed, replaced or traversed, so a page opened on a session attaches its tab to the engine in happy-dom as it does in a browser.
