---
'@conciv/cli': patch
'@conciv/backend': patch
---

`conciv plugin call <rpcId> <method> --data '<json>'` calls a method a plugin registered on your running dev server and prints its output as JSON, from the project folder or from anywhere on the machine. You name the plugin's RPC id and the method; the CLI does not list them. The terminal holds the engine token, so it calls as the owner: only callers that announce themselves as outside, such as agents connected through `conciv mcp`, are still refused plugin calls.
