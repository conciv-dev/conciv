---
'@conciv/ai': patch
---

A harness CLI that takes more than 10 seconds to print its first line (a cold start, a slow machine) now reports its real result instead of failing with "cannot attach to run". The journal's first-byte wait follows the chat server's first-output budget, so a CLI that stays silent past that budget fails with "the agent produced no output within" instead.
