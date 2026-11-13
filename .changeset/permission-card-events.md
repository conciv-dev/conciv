---
'@conciv/protocol': patch
'@conciv/contract': patch
'@conciv/chat': patch
'@conciv/ai': patch
---

The `approval-requested` chat event may carry `permission: {always: boolean}`, which marks the card as a plugin permission request, and `approvalAskOf` passes it through. A new `approval-settled` chat event (`approvalSettledEvent`, read with `approvalSettledOf`) names an approval whose card should go away on every client.

A stored pending approval keeps `permission`, whether a turn or a plugin asked for it, so `chat.hydrate`, the replay a new subscriber receives, and a chat session loading saved state show the same card as a live ask. The chat plane gains `permissionAsked` and `permissionSettled`, which store and drop a permission card without writing an approval grant. Updates to a thread's pending approvals run one at a time, so overlapping asks and settles never lose a card or bring a settled one back.
