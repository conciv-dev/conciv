---
'@conciv/core': patch
'@conciv/plugin-page': patch
---

The chat system prompt no longer talks about the page. The page plugin gives a session its page instructions itself, as an instruction entry under `page`, once a page attaches and page access opens: live DOM, CSS and React tweaks are ephemeral and get persisted to source, and "this" or "here" means the rendered page. The entry is removed when page access closes, so a session with no page open gets none of that text.
