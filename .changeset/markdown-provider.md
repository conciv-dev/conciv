---
'@conciv/ui-kit-chat': patch
---

`MarkdownProvider` hands `openLocalFile`, `localFileExists` and code block content to every `Markdown` below it, as opencode's markdown context does; `codeBlocks={false}` turns the content off below.

A fence whose code block content declines, fails or throws shows the normal highlighted code block, as opencode does.
