---
'@conciv/ui-kit-chat': patch
---

Mermaid code blocks in chat replies now render as diagrams once the reply finishes streaming. The diagram follows the widget's light or dark scheme, and a block that does not parse stays a plain code block. Mermaid loads only when the first diagram appears, so replies without diagrams pay nothing for it.
