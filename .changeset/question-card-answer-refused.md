---
'@conciv/protocol': patch
'@conciv/tools': patch
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

Answering a question card while the page is logged out, its login was revoked, or the engine cannot be reached no longer shows "That question is no longer waiting for an answer." It shows the same notice Send shows, and the card takes your answer again instead of staying on "Sending your answer…".

For card authors: `addResult` on a tool card (and on the tool view context) now returns a promise, which rejects when the answer was refused.
