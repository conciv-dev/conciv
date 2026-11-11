---
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-chat': patch
'@conciv/solid-diffs': patch
'@conciv/solid-streamdown': patch
---

Kit components now pass any extra props, such as `data-*` and `aria-*` attributes, through to their root element. `Chip` gains a `compact` size (one-line, sans-serif, tinted fill) and `TextField` an `outline` variant (32px tall, panel background).
