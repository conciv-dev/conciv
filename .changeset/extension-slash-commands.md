---
'@conciv/extension': patch
---

Extension slash commands run in the widget. A command picked from the `/` menu, or typed alone and sent, calls its `run({sessionId})` and is never sent to the agent; it replaces a harness command of the same name. The widget's built-in `/model` opens the composer's model menu.

Breaking: `ExtensionCommand` is now `{name, description, run(context)}`. The unused `argumentHint` and `prompt(args)` fields are removed.
