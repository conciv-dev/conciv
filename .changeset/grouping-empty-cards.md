---
'@conciv/ui-kit-chat': patch
---

Chat transcript grouping is now derived from message data (assistant-ui groupParts model): unrenderable parts can no longer produce an empty Chain of Thought wrapper, tool cards always show a chevron, and grouped presentations (chain, page session) register through a generic GroupEntry. Every tool card body now renders a data-derived floor — input chips, a state row such as "searching…" or "recording…", or a quiet "no input" row — so no card expands into an empty strip. The page-session card is the one deliberate exception: it is a group summary rather than a single tool call, so it renders its step rail instead of an input row.
