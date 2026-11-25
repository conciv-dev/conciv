---
'@conciv/backend-plugin-api': patch
'@conciv/backend-app-api': patch
---

The agent's dev-server restart now always asks first, also while plugins reload. `permission.assert` (Effect and Promise) takes a new optional field, `AssertInput.fallback?: 'ask'`, which opencode's `AssertInput` does not have: a tool's own ask, used only when the agent's built-in allow-all is all that would answer. Any rule naming the action, from a plugin or config agent rule, the session or a saved "always allow" answer, beats it either way, and a deny still denies. The restart passes it instead of pushing an ask rule onto every agent, so an agent rule for `server_restart` is now obeyed where before the pushed ask overrode it. A blanket `{action: '*', effect: 'allow'}` rule does not switch the tool's own ask off: name the action, as in `{action: 'server_restart', resource: '*', effect: 'allow'}`.
