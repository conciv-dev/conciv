---
'@conciv/protocol': patch
'@conciv/client': patch
'@conciv/core': patch
---

Draw the permission card for an approval that has no chat turn behind it. A gated MCP, registry or
page call asked over the push socket and nothing rendered, because the pane built approval cards only
from a transcript tool call. Pending approvals now reach the pane as records, from
`chat.hydrate` on open and from the push socket while it is attached, and the pane renders the same
`Permission request` card from them. The card leaves when the ask settles: the gate publishes an
`approval-settled` chunk when a decision, a timeout, or a session stop resolves the ask.
