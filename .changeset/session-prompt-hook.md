---
'@conciv/plugin': patch
'@conciv/plugin-host': patch
'@conciv/chat': patch
'@conciv/ai': patch
'@conciv/core': patch
---

Plugins can register opencode's session `prompt` hook: `ctx.session.hook('prompt', (event) => ...)`. It runs once per new user message, after the plugins are active and before the message is stored or the agent sees it. Hooks run in the order they were registered, one after the other, on the same event; when they changed the event, what they leave in `event.prompt` (its text and its files, as `data:` URIs) is the message that is stored, shown and sent to the agent; when no hook is registered or no hook changed it, the user's message is stored and sent exactly as before, part for part. A retry of a message that is already stored does not run the hook again, and stopping the turn while a hook is still running stores nothing.
