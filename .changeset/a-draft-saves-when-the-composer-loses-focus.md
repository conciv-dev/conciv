---
'@conciv/app': patch
'@conciv/ui-kit-chat': patch
---

The composer saves its pending draft as soon as focus leaves it, so an edit made just before closing the panel survives a reload in a browser that refuses site storage.
