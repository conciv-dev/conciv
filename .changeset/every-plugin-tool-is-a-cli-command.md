---
'@conciv/core': patch
'@conciv/cli': patch
'@conciv/plugin-page': patch
'@conciv/harness-init': patch
---

Every plugin tool is a `conciv tools` command, derived the same way: the positional argument is the tool's single required string field, the category is its plugin, and no command is marked mutating ahead of time (a tool that asks shows its approval card when it runs). The page tools no longer have a CLI table of their own, so the `react` group is gone: React commands are in the `page` group (`conciv tools page locate`, `inspect`, `find`, `track` ...). `tabs_list` and `fill_form` are listed, `--tab-id` shows as a flag, and a page selector is passed as `--selector`, since every page selector is optional. `conciv tools page find` takes the component name as its argument. The agent guide `conciv init` writes uses these spellings.
