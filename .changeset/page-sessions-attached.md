---
'@conciv/plugin-page': patch
'@conciv/core': patch
---

A tab the page plugin attaches shows up in the tab listing again: `tabs.list` lists its session and `tabs.get` answers it as open. The page plugin answers which sessions have a tab attached through `sessions.attached`.
