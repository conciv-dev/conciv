---
'@conciv/protocol': patch
---

A plugin rpc call that fails because of the caller (unknown plugin or method, invalid input, or an error the method declares) now answers HTTP 400 with code `PLUGIN_RPC`, and a plugin defect (`rpc.internal`, `rpc.invalid_output`) answers 500 with code `PLUGIN_RPC_INTERNAL`, as opencode does; before, every failure answered 500.
