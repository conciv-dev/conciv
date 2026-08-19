---
'@conciv/solid-streamdown': patch
---

Fix a residual DOM-churn source left after the hast-identity fix: the animate plugin recomputed each word's `skipAnimation`/`delay` from `prevContentLength` on every parse, so a word transitioned from its animating style to its settled style with one attribute write per word (42k+ style writes in one measured streaming turn). The plugin now resolves each word's animation decision once, keyed by its position, and reuses it on every later parse, so already-rendered spans are never rewritten. New words still fade in and stagger exactly as before.
