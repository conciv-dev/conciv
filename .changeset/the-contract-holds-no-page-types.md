---
'@conciv/contract': patch
'@conciv/protocol': patch
'@conciv/core': patch
'@conciv/chat': patch
'@conciv/cli': patch
'@conciv/plugin': patch
'@conciv/plugin-page': patch
---

The contract and protocol hold no page types. `@conciv/protocol/page-types` is gone: its schemas, constants and helpers live in `@conciv/plugin-page/rpc`. The contract's `page` group, `NO_QUEUE` and `queueNotice` are gone, and `code.execute` lists `toolCalls` instead of `queued` and `finished`: the ids of the tool calls the run made, in start order. `code.discover` lists no queues. The page plugin's `queue.outside` takes the required `toolCallIds` of the calls whose queues it answers. A new `sessions.instructions({sessionId})` answers the system text the session's next turn would send (base prompt, plugin instructions and what the `session.context` hooks leave), storing nothing. The hub no longer turns a queue call into an MCP task until it reads queues from the page plugin.
