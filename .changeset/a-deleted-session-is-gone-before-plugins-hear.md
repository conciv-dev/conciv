---
'@conciv/backend': patch
---

A plugin or page that hears session.deleted and reads the session back now finds it already gone, as after the delete. A delete whose drafts cannot be dropped still publishes session.deleted, and a delete whose drafts, session.deleted event or any cleanup step fails still clears the session's messages, captures and page changes, then reports every failure.
