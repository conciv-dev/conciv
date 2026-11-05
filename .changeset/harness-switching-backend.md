---
'@conciv/core': patch
---

Switch the harness of a chat session between turns: `sessions.switchHarness` moves a session to another installed harness, the next turn replays the whole chat to it, and every reply records which harness produced it. Models, slash commands and harness details are now per session, and the session list covers every installed harness.
