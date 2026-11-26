---
'@conciv/types': patch
'@conciv/backend': patch
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
---

Answering a question card while the page is logged out or its login was revoked shows the same notice Send shows, and while the engine cannot be reached it says "conciv lost connection to the engine. Your answer was not sent." In each case the card takes your answer again instead of staying on "Sending your answer…". An answer the engine itself refuses still says "That question is no longer waiting for an answer." and the card stays as it was.

For card authors: `addResult` on a tool card (and on the tool view context) now returns a promise, which rejects when the page could not send the answer.
