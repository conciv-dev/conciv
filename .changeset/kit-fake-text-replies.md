---
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

The kit's scripted model is TanStack AI's `fakeText`, one per engine. `engine.reply` takes only `TestLLM` replies: `TestLLM.text(value)` (no message id), `TestLLM.toolCall(id, name, input)`, `TestLLM.failAfter(error)` and `TestLLM.hang()`, which replaces `hangAfter`. Raw chat-event arrays and Effect `Stream` replies are gone. `start.tokensPerSecond` paces every reply's text.
