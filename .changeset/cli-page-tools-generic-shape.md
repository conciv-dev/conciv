---
'@conciv/cli': patch
'@conciv/harness-init': patch
---

`conciv tools` builds every page command from the tool's own input schema, as for any plugin tool: the separate `conciv tools react` group is gone (its commands are `conciv tools page find|inspect|locate|override|track|tree`), an optional selector is the `--selector` flag (`conciv tools page text --selector h1`), and a tool with one required text field takes it as its argument (`conciv tools page find App`, `conciv tools page eval <expression>`). The agent guide `conciv init` writes uses these forms.
