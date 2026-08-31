---
'@conciv/protocol': patch
'@conciv/db': patch
'@conciv/core': patch
'@conciv/ui-kit-chat': patch
---

Delete dead chat-plane code found in a source audit of the calm-chat-plane branch:
`snapshotToTokenUsage` (only consumer was its own test), the self-referential
`ChatMessageSchema`/`ChatRequestSchema` (no import site anywhere), and the `replies`
table plus `writeReply`/`replyFor` (truncated on every boot, no non-test consumer).
A drizzle migration drops the `replies` table.

Delete our bespoke `APPROVAL_REQUESTED_EVENT`/`ApprovalRequest`/`aguiApprovalRequestedFor`
helpers in `@conciv/protocol`; the single emitter in `@conciv/core`'s permission gate now
builds `@tanstack/ai`'s `ApprovalRequestedEvent` directly and stamps it with tanstack
run/thread metadata via `withTanstackMetadata`, keeping the event name string sourced from
`@tanstack/ai-sandbox`'s `APPROVAL_REQUESTED_EVENT` constant.
