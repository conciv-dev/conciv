---
'@conciv/harness': patch
'@conciv/embed': patch
---

The Claude model picker now lists the models your Claude account offers, read live from the Agent SDK (the same list as Claude Code's `/model`), instead of a hardcoded list. Core keeps the last list on disk, so the menu shows at once on later starts. The default model is now Opus. Pinned model ids are grouped under "Older versions".

The model menu moved out of the composer's overflow menu onto the composer prompt: the prompt shows the current model (`opus ❯`) and opens a one-line-per-model menu, with older versions in a nested submenu.

The model menu ends with an Effort row: pick the reasoning effort the model supports (low, med, high, xhigh, max, or default) per session; the prompt reads `opus 5.5 · high ❯`, and switching to a model without effort clears it.

The context meter uses the context window Claude reports for each turn (1M for Haiku 5.5, Opus 5.5 and others), instead of guessing 200k, and effort now reaches Claude 5 models (Fable, Opus 5, Sonnet 5, the 5.5 aliases).
