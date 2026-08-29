---
'@conciv/protocol': patch
'@conciv/db': patch
---

Delete dead chat-plane code found in a source audit of the calm-chat-plane branch:
`snapshotToTokenUsage` (only consumer was its own test), the self-referential
`ChatMessageSchema`/`ChatRequestSchema` (no import site anywhere), and the `replies`
table plus `writeReply`/`replyFor` (truncated on every boot, no non-test consumer).
A drizzle migration drops the `replies` table.
