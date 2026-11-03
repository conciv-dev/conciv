---
'@conciv/cli': patch
'@conciv/core': patch
'@conciv/embed': patch
'@conciv/extension': patch
'@conciv/extension-compiler': patch
'@conciv/extension-recorder': patch
'@conciv/extension-terminal': patch
'@conciv/harness-init': patch
'@conciv/plugin': patch
'@conciv/skills': patch
'@conciv/ui-kit-system': patch
---

The engine API now sits behind a login token. Agents and the CLI reach it under `/t/<token>` (the token is in `CONCIV_TOKEN` and in `.conciv/mcp-endpoint.json`). The widget asks the dev server whether this browser is trusted; a missing, stale or wrong token counts as untrusted. Until then nothing pops up and the host page stays usable: only the conciv launcher shows a lock. Clicking it opens a dismissable login that takes the 6-digit code printed in the terminal (a `#devframe_otp=<code>` magic link works too), and the widget then talks to the engine through the trusted base. `@conciv/ui-kit-system` gains a `PinInput` for the code.

The login is rate limited: after ten wrong codes in five minutes the engine refuses further code attempts until the window clears, and it issues at most three new codes a minute.
