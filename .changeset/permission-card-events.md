---
'@conciv/protocol': patch
---

The `approval-requested` chat event may carry `permission: {always: boolean}`, which marks the card as a plugin permission request, and `approvalAskOf` passes it through. A new `approval-settled` chat event (`approvalSettledEvent`, read with `approvalSettledOf`) names an approval whose card should go away on every client.
