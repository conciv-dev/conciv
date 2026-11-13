---
'@conciv/protocol': patch
'@conciv/contract': patch
'@conciv/chat': patch
---

The `approval-requested` chat event may carry `permission: {always: boolean}`, which marks the card as a plugin permission request, and `approvalAskOf` passes it through. A new `approval-settled` chat event (`approvalSettledEvent`, read with `approvalSettledOf`) names an approval whose card should go away on every client.

A stored pending approval keeps `permission`, so `chat.hydrate` and the replay a new subscriber receives show the same card. The chat plane gains `permissionAsked` and `permissionSettled`, which store and drop a permission card without writing an approval grant.
