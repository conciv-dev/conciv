---
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-system': patch
'@conciv/embed': patch
---

The chat column reads every type size, line height, letter spacing, mark size and transition duration from tokens instead of hand-picked values: a chat type scale (`text-chat-micro` through `text-chat-body`), `--chat-mark` sizes derived from the trace gutter, and duration tokens (`--chat-duration-fast`, `-normal`, `-slow`) behind the preset's transition shortcuts. A reply that is still running no longer leaves an empty strip for its action bar above "Responding…"; the bar's row appears once when the run ends.
