---
'@conciv/core': patch
---

Page tools called by a session the page is not showing now fail right away with "the page is showing another session; switch back to this session to use page tools" instead of waiting for the page to time out. Only the page plane's push socket receives page queries; a socket kept open for a background session's chat events no longer does.
