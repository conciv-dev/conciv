---
'@conciv/backend': patch
'@conciv/backend-defaults': patch
---

A Stop pressed while a plugin's prompt hook prepares the message now interrupts the engine's hook run (an Effect hook is interrupted; a promise-style hook's function is abandoned and its result ignored) instead of leaving the run waiting. For implementers: `TurnPlan.prompt` (`@conciv/ai`) and the chat plane's `TurnDeps.prompt` (`@conciv/backend-defaults`) take the run's `AbortSignal` as a second argument; a stop aborts it, and the engine still ends the turn at once if an implementation ignores it.
