---
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

Remove the Copy text built for outside agent runs. As in opencode, a turn with only tool calls has no action row, so that text could never be copied. `AssistantActionBar` no longer takes `copyText`.
