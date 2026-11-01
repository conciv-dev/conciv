---
'@conciv/extension-recorder': patch
'@conciv/contract': patch
---

Every queued recorder stop now finishes its session, failed recorder controls are logged, and node RPC links keep the caller's abort signal so an aborted stream really closes.
