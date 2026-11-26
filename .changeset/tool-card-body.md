---
'@conciv/types': patch
'@conciv/ui-kit-chat': patch
---

`ToolCardProps` takes an optional `body`. The catalog tool card (`MetaToolCard`) and the default fallback card (`ToolFallback`) draw it in place of their own body, under their normal header: the headline with the positional value, the badge, the input chips, the duration and the status stay the card's own. Without a `body` both cards draw as before; every other card ignores the prop.
