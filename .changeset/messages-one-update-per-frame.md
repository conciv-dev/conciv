---
'@conciv/ai': patch
'@conciv/embed': patch
---

The chat thread updates at most once every 16 ms while a reply streams, instead of once per streamed chunk. A burst of chunks (a tool step, fast text) now costs one render, as in opencode's client. The session's own logic still reads the live list, and a tab that comes back into view shows the newest messages at once.
