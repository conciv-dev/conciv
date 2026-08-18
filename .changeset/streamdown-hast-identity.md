---
'@conciv/solid-streamdown': patch
---

Fix a measured DOM churn regression during streaming: `Block` rebuilt a fresh hast object graph on every text update, so Solid saw new object identity for every node and destroyed/recreated the whole subtree (72k+ node removals per turn with animation on). The hast tree built by the new `createHast` export now flows through `createImmutable` so unchanged nodes keep their identity across renders and Solid patches instead of rebuilding. Rendered markdown, animation timing, and caret behavior are unchanged.
