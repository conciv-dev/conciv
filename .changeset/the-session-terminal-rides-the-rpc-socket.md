---
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/serve': patch
'@conciv/ui-kit-terminal': patch
'@conciv/builtin-plugins': patch
---

The session terminal rides the rpc socket. `experimental.persistentPty.output({ptyId, cursor?})` streams the terminal: it replays from the cursor in 64 KiB pieces, sends `{type: 'meta', cursor}` with the absolute cursor, then live output, and every output item carries its cursor so a resubscribe never repeats output. `write`, `resize` and `inject` drive it. `connectToken` and the `/api/experimental/persistent-pty/:ptyId/connect` socket are gone: `create` admits the caller's origin and the other terminal calls refuse any origin it never admitted. A stream whose reader stops reading gets `SLOW_CONSUMER` once the rpc socket holds 8 MiB it has not sent, instead of the engine buffering for it. `createTerminalModel` takes the `transport` its session runs over.
