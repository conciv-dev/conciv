---
'@conciv/ui-kit-chat': patch
---

Tool trace rows no longer draw an empty bordered frame around a card that renders nothing: a tool card
entry can now declare `hasEmbeddedBody`, and `execute_typescript` uses it so a void-returning run keeps
its row (title, `ok`, status) without an empty output box. Card headers also baseline-align their title
and metric text, so counts like `4 actions` and durations like `0.1s` no longer sit below the title.
