---
'@conciv/app': patch
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-system': patch
'@conciv/harness-testkit': patch
'@conciv/extension-testkit': patch
'@conciv/solid-streamdown': patch
'@conciv/extension-whiteboard': patch
---

The session picker previews the highlighted session beside the list: a read-only thread of its transcript, newest messages first with earlier pages loading on scroll, the search words marked, `Alt+ArrowRight` to read it and `Alt+ArrowLeft` back to the search, Escape closing the preview before the picker. Core serves it through the read-only `sessions.preview` procedure. Search marks now come from Ark `Highlight` and zag `highlightWord`, and keyboard hints share one ui-kit-system `Kbd`. `Thread.Messages` takes `readOnly`, which leaves the assistant action bar with Copy only; the preview sets it.
