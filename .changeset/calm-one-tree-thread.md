---
'@conciv/ui-kit-chat': patch
---

Render the thread through one tree at every length. Crossing the virtualization threshold no longer
swaps a flat list for a virtualized one, so every turn root keeps its DOM identity as a conversation
grows. Below the threshold the virtualizer windows nothing; at and above it eviction is unchanged.
