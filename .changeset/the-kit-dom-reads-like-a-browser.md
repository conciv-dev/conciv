---
'@conciv/plugin-testkit': patch
---

The happy-dom setup reflects `autofocus` on every element, reads only string items in `DataTransfer.getData`, gives `localStorage` a real quota (Node's built-in storage, cleared after each `mount`), and the `./browser` and `./node` tests get an `expectLog(pattern)` fixture that declares a console line the test expects. Testing Library waits as long as the runner polls.
