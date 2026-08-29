---
'@conciv/ui-kit-chat': patch
---

Estimate settled turn heights from the real answer-row DOM: the metrics probe now mirrors the assistant root, answer row, answer content and prose paragraphs, and the estimator accounts for row padding, root padding and paragraph spacing instead of compensating with a flat extra.
