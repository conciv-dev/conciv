---
'@conciv/core': patch
---

A session whose harness transcript is gone now shows its real last activity and title: lastActive comes from the newest message conciv recorded for it (hub tool calls included), and the title from its first user message, before falling back to "New session". The session list orders and pages by that same derived time.
