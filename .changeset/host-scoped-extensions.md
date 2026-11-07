---
'@conciv/extension': patch
'@conciv/core': patch
'@conciv/protocol': patch
'@conciv/contract': patch
'@conciv/client': patch
'@conciv/chat': patch
'@conciv/embed': patch
'@conciv/extension-ios': patch
---

A session only sees the extensions its widget host serves. Every extension now declares `hosts` (`'web'` and/or `'ios'`), the widget reports where it runs when it serves a session's page, and that session's tools and system prompt come only from extensions serving that host: a web page no longer sees the iOS simulator tools or the iOS overlay prompt, and the iOS overlay no longer sees the page tools. A session with no widget connected still sees every extension.
