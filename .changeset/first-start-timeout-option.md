---
'@conciv/backend-defaults': patch
'@conciv/backend': patch
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

The limit for an agent that never starts is an option: `makeApp` takes `firstStartTimeoutMs`, handed to the chat server beside `firstChunkTimeoutMs`. Without it the limit stays 30 seconds and the turn still fails with "the agent did not start within 30s". The test kits take it in `timeouts`, so a test can see that failure in half a second.
