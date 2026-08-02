---
'@conciv/ui-kit-chat': patch
---

Load shiki grammars and themes lazily so code-splitting consumers don't hoist doubly-reachable modules.
