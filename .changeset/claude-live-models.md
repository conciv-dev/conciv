---
'@conciv/harness': patch
'@conciv/embed': patch
---

The Claude model picker now lists the models your Claude account offers, read live from the Agent SDK (`supportedModels()`), instead of a hardcoded list. The default model is now Opus. Pinned model ids are grouped under "Older versions".

The model menu moved out of the composer's overflow menu onto the composer prompt: the prompt shows the current model (`opus ❯`) and opens a one-line-per-model menu, with older versions in a nested submenu.

The model menu ends with an Effort row: pick the reasoning effort the model supports (low, med, high, xhigh, max, or default) per session; the prompt reads `opus 5.5 · high ❯`, and switching to a model without effort clears it.
