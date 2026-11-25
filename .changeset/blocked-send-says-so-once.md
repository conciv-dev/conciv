---
'@conciv/app': patch
---

A Send that cannot send now looks disabled, also with text in the composer. While the connection is lost, a refused send no longer adds a second notice under the standing lost-connection notice. Retry on a failed run and Refresh on a reply are no longer offered while the page is logged out, its login was revoked, or the connection is lost.
