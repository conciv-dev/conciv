---
'@conciv/plugin-page': patch
---

The agent's page glow follows reduced motion like the cursor pacing does: with `prefers-reduced-motion: reduce` the WebGL glow is neither created nor started, and the mask and cursor still show that the agent is using the page.
