---
'@conciv/simulation': patch
---

A tool called through code mode (`session.tool(name).call` on a code-mode tool, `engine.outside().call`) must have a plain identifier for a name (letters, digits and `_`, not starting with a digit): any other name is refused with a plain message before the `external_<name>` program is built.
