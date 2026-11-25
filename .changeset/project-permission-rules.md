---
'@conciv/types': patch
'@conciv/backend-app-api': patch
'@conciv/backend': patch
'@conciv/cli': patch
'@conciv/plugin-testkit': patch
---

The project config takes `permission` and `permissions`: allow, deny or ask for a tool ahead of time, for every agent, so a headless run or CI needs nobody at the tab. `permission` is a short form (one effect for everything, per tool, or per tool and resource); `permissions` lists full `{action, resource, effect}` rules. A config rule never opens the page tools before the tab connects. A rule in these options now decides a terminal page eval too: `conciv tools page eval` runs with `permission: {page_eval: 'allow'}` and is refused with `page_eval: 'deny'`, with nobody at the tab.

A page eval card no longer offers "Always allow": an answer approves that one eval and saves no rule, so every later eval asks again unless a config rule decides it.

A terminal eval naming its tab (`--tab`) is asked the same way: only a config rule lets it run with nobody to approve, and a config deny refuses it.
