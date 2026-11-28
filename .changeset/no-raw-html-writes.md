---
'@conciv/ui-kit-chat': patch
---

Mermaid diagrams in chat are inserted as parsed nodes instead of an `innerHTML` string, and the recorder replay mount is cleared with `replaceChildren()`.
