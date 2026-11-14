---
'@conciv/ui-kit-chat': patch
---

`MarkdownProvider` hands `openLocalFile`, `localFileExists` and code block content to every `Markdown` below it, as opencode's markdown context does; `codeBlocks={false}` turns the content off below.
