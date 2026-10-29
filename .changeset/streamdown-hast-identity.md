---
'@conciv/solid-streamdown': patch
'@conciv/ui-kit-chat': patch
---

Stop streamed text from flickering. Each markdown block is now a keyed node tree held in a store and reconciled by key, so words that have already settled keep their DOM node and never replay their fade; only newly mounted words animate in. The old character-counting animate plugin, its stagger variables, and the `createImmutable` hast wrapper are gone. The streaming answer also drops `text-wrap: pretty`, which re-balanced line breaks as text grew and moved settled words between lines; settled answers keep it.
