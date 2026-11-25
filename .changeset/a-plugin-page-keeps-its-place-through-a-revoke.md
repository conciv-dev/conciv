---
'@internal/frontend-defaults': patch
'@conciv/app': patch
'@conciv/backend-plugin-api': patch
---

A page on a plugin's settings page or tab keeps its place while the browser is logged out or revoked. Opening that page again after a revoke and logging in shows the plugin's page, instead of sending it to General or to the chat and saving that move.
