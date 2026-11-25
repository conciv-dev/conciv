---
'@conciv/backend': patch
---

A page tab with the conciv panel attaches again by itself after the engine restarts or its connection drops, so an agent can keep driving a page nobody is touching. A tab that attaches while the engine's plugins are still starting now waits for them instead of giving up until the page is reloaded.

A page action that already ran is no longer reported as failed when saving its record afterwards fails, so the agent does not repeat it.

A queued page action the engine gives up on stops on the page instead of still typing while the next one starts, and a page wait stops when it is cancelled.

A queued page action that never reached the page is reported as lost, not counted as played.

A page tab whose attach was refused because its page permissions could not be granted in time tries again by itself on a back-off instead of waiting for a reload; the engine option permissionSyncTimeoutMs sets how long that grant may take. A tab on a session that does not exist, deleted or new before its first send, does not retry; it attaches once the session is created.

A page eval the config denies is refused from the widget's own tab too, not only from outside callers.

A page read of the DOM or of an attribute shows a password field's value attribute masked, as a value read already did.

When the page plugin is turned off it removes its agent cursor listeners from the host page and leaves a console wrapper installed after its own in place, and a tab waiting to attach again no longer adds listeners on every wait.
