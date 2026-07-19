---
'@conciv/ui-kit-terminal': patch
---

Drop the test-only backdoors from the terminal public surface: `TerminalModel.__testReceiveControl` and the `HTMLDivElement.__concivTerminal` global augmentation are gone. Control-frame behaviour (exit, error, busy) is now covered by tests that drive a real WebSocket server through the normal socket path instead of injecting frames directly.
