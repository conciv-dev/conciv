---
'@internal/frontend-defaults': patch
---

A link to a plugin's tab or to a plugin's settings page no longer sends you to the chat or to General when the conciv engine cannot be reached. The address stays the one you opened, the "conciv lost connection to the engine." notice offers Retry, and once the engine answers the page you asked for opens. A plugin that is really gone still sends you back, once the engine has answered.
