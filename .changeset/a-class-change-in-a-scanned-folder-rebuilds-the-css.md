---
'@conciv/app': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/ui-kit-tap': patch
---

A style change in a plugin or kit that the widget's stylesheet reads now rebuilds that stylesheet, instead of the build reusing an older copy that lacked the new styles.
