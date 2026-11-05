---
'@conciv/embed': patch
---

A session left mid-turn now settles correctly in more cases. Approving or denying a permission request and switching sessions before the reply starts no longer drops that reply. A queued follow-up removed before leaving no longer keeps the left session connected after its turn ends. A turn that finishes while the connection is down is settled when the connection comes back, so the session list, markers and captures refresh and the reply is announced.
