---
'@conciv/core': patch
---

A plugin or page that hears session.deleted and reads the session back now finds it already gone, as after the delete. A delete whose session.deleted event cannot be published still clears the session's messages, captures and page changes, then reports the failure.
