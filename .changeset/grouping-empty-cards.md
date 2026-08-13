---
'@conciv/ui-kit-chat': patch
---

Chat transcript grouping is now derived from message data (assistant-ui groupParts model): unrenderable parts can no longer produce an empty Chain of Thought wrapper, tool cards always show a chevron and always expand to at least their input (chips or a quiet "no input" row), and grouped presentations (chain, page session) register through a generic GroupEntry.
