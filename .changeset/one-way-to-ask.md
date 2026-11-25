---
'@conciv/backend': patch
'@conciv/backend-defaults': patch
'@conciv/backend-app-api': patch
'@conciv/simulation': patch
'@conciv/cli': patch
'@conciv/skills': patch
'@conciv/types': patch
'@conciv/protocol': patch
'@conciv/client': patch
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
---

A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.
