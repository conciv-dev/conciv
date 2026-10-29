---
'@conciv/harness': patch
---

`claudeExecutable` now throws if the plugin directory path contains whitespace, instead of silently
producing a broken spawn. `@tanstack/ai-claude-code` builds its argv by splitting the executable
string on plain spaces with no quoting, so a plugin dir with a space in it would previously mangle
the `claude` invocation.
