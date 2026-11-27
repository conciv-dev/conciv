---
'@conciv/client': patch
---

The engine, the widget and the CLI now speak oRPC 2 (2.0.0-beta.53). The oRPC 2 wire format differs from oRPC 1, so all three must run the same release: an older widget bundle cached in a host page, or an older globally installed CLI, cannot talk to a newer engine until it is upgraded.

The rpc procedures `registry.call` and `plugin.call` are now `registry.invoke` and `plugin.invoke`: an oRPC 2 client treats a property named `call` as `Function.prototype.call`, so a procedure of that name cannot be reached. The `conciv plugin call` command and a plugin's `ctx.client.rpc.call` keep their names.

Every rpc error now answers with the HTTP status of its meaning (400 for a bad call, 404 for something missing, 409 for a conflict, 503 for something unavailable) and carries `why` and `fix` in its data; the CLI prints the `fix` line as its hint. Error data schemas are gone except for the plugin rpc errors, whose data is still the plugin's own `{type, message, data}`.
