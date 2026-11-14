---
'@conciv/app': patch
---

A plugin store whose stored value fails its schema now keeps every valid field and resets only the failing ones to the store's initial value, instead of replacing the whole stored value.
