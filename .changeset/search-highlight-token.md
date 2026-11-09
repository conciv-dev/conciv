---
'@conciv/app': patch
'@conciv/ui-kit-chat': patch
'@conciv/uno-preset': patch
'@conciv/ui-kit-system': patch
---

Search matches in the session picker and preview use the shared `chat-accent-20` tint with `chat-text` ink, so matched words read at WCAG AA on every row; the one-off `--chat-highlight` token is gone.
