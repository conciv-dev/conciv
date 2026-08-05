---
'@conciv/tools': patch
---

Every built-in capability — page, server, and the `open` editor tool — is now declared as a registry tool with its own input/output schema and meta, importable from `@conciv/tools/builtins` and a UI-free `@conciv/tools/page` subpath for consumers that don't want Solid pulled in. `@conciv/extension` gains a matching `@conciv/extension/tool` subpath so the CLI and widget can share the same tool contract without loading the widget's rendering code. The CLI derives its command tree, flags, and help text directly from these declarations instead of hand-maintained argument parsing.
