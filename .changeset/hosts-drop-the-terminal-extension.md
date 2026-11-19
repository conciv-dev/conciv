---
'@conciv/embed': patch
'@conciv/react': patch
'@conciv/preact': patch
'@conciv/solid': patch
'@conciv/extension-terminal': patch
---

Hosts no longer pass the terminal extension: the Terminal panel is built into every widget. The example apps, the framework components' docs and the install guide drop `@conciv/extension-terminal`; only `@conciv/try` still mounts it on its own engine.
