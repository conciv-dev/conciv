---
'@conciv/backend-plugin-api': patch
'@conciv/backend-app-api': patch
'@conciv/backend': patch
'@conciv/backend-defaults': patch
'@conciv/db': patch
'@conciv/types': patch
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
---

A plugin can add a notice to a session with `session.synthetic({sessionID, text, ...})`, as opencode's: the notice waits in the session's inbox, wakes an idle session into a turn (unless `resume: false`), goes in with the next run when a run is live or stopped, and the same `id` twice stores one notice. The model gets the notice text as a user message, a resumed CLI session included; the chat shows the notice as its own row labelled with its description, and hides one whose description is missing or only spaces, unless the notice failed (metadata `state: 'error'`, or a shell notice that completed with a non-zero exit or a timeout), which shows under its text. A notice is never a session's title: a session takes its first typed message as its title.
