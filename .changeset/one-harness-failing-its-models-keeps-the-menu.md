---
'@conciv/protocol': patch
'@conciv/core': patch
'@conciv/ui-kit-chat': patch
---

A session whose harness fails to list its models no longer fails the whole model menu or the terminal. The session models answer still carries the harness, with `modelsFailed` set, so the menu keeps the other harnesses and shows a retry row for the one that failed, and the terminal tab still shows for a harness with a terminal.
