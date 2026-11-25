---
'@conciv/plugin-page': patch
'@conciv/backend': patch
---

New package `@conciv/plugin-page`: the engine part of conciv's page plugin, written against the public plugin SDK. It holds the connection to the page, the page tools and skill, and the RPC contract (`@conciv/plugin-page/rpc`) the page's browser part talks to. The page plugin answers which sessions have a tab attached (`sessions.attached`); the tab listing (`tabs.list`, `tabs.get`) reads it.

The page plugin takes two options: `pageReplyTimeoutMs` (default 5 000) is how long a tab has to answer a page action, and `queuedActionTimeoutMs` (default 7 000) is how long each queued action has to confirm once the tab reaches it. Core passes its own two settings of the same names through.

In `@conciv/plugin-page/rpc`, a `CliTools` entry's `asks` is the permission that tool asks for: a function from the call's input to `{action, resources}` (the `AskedPermission` type), and absent for a tool that does not ask. The page tool's own check and the terminal's check both read it.
