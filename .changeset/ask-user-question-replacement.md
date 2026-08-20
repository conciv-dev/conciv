---
'@conciv/protocol': patch
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/harness': patch
'@conciv/tools': patch
'@conciv/ui-kit-chat': patch
---

The claude harness now disables the native `AskUserQuestion` tool: it only works in a TTY and auto-resolved as "the user did not answer the questions" within ~400ms under our non-TTY adapter, so the widget never showed anything and the agent proceeded on its own. `conciv_ui`'s `questions` kind replaces it: one or more multiple-choice questions, each with its own options (label + optional description) and an optional `multiSelect`, rendered as a real interactive card (option buttons, an "Other" free-text field, Submit and Dismiss) that blocks the turn until the user answers or dismisses. `uiReply` now also accepts an explicit `dismissed` flag, resolved through the same `AskRegistry` pending-ask mechanism used for approvals, including on a stopped turn.
