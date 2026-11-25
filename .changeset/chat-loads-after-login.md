---
'@conciv/app': patch
---

Logging in again now brings the open conversation back by itself. Before, when the chat panel was open while conciv lost its login (for example after the page moved to an engine address it had not logged in to), an empty conversation kept showing "Couldn't load this conversation" after logging in until Retry was pressed, and a conversation with messages showed two stale "this connection is not trusted" lines and a Retry button under the reply.

Send is now blocked while the page is logged out or its login was revoked, and the Send button says why. What you typed stays in the composer and sends normally after you log in; pressing Enter meanwhile shows the same sentence. The empty-conversation starter buttons, replies from tool cards (such as "Fix this") and Steer on a queued message are refused the same way, and now also while the engine connection is lost or a compaction runs.
