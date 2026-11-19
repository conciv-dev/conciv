---
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
'@conciv/builtin-plugins': patch
---

The composer and the Terminal share one model selector from the chat kit. The Terminal's selector says Models… while it reads the model list, and after a failed read it offers Retry inside the selector, as the composer does. The selector keeps one width while it loads, fails or has no models, so the tabs beside it stay still. The composer's model prompt stays enabled when the session's harness lists no models, so it still opens and another harness can be picked; only the Terminal's pill turns disabled then.
