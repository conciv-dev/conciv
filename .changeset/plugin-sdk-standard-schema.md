---
'@conciv/plugin': patch
---

The plugin SDK follows opencode's file layout, takes any Standard Schema (not only zod) for tool, RPC and store
schemas, and exports every engine-side type by name from its root entry, including `SessionIdle`, `SessionInfo`,
`ConcivClient`, `ConcivEvent` and `ServerRef`. Breaking: namespace members that were not opencode's moved to root
names on `@conciv/plugin`: `Rpc.Rpc*` (`RpcClient`, `RpcApi`, `RpcHandlers`, `RpcDomain`, `RpcCallOptions`,
`RpcEventPayload`, `RpcArguments`, `RpcCallContext`, `RpcRegistration`), `Tool.ToolContext`, `Tool.ToolEditor` and
`Tool.ToolDomain`, `Plugin.PluginInfo` and its siblings `Plugin.PluginSource`, `Plugin.PluginState` and
`Plugin.PluginFeatures`, `Model.ModelEditor`, `Model.ModelDomain` and `Model.ModelListInput`, `Agent.AgentEditor` and
`Agent.AgentDomain`, `Skill.SkillEditor` and `Skill.SkillDomain`. `@conciv/plugin/rpc` is the `Rpc` schema namespace
only: a contract module that used `Rpc.RpcClient` imports `RpcClient` from `@conciv/plugin` instead.
