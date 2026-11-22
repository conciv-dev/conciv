---
'@conciv/plugin': patch
'@conciv/plugin-host': patch
'@conciv/core': patch
'@conciv/chat': patch
'@conciv/ai': patch
'@conciv/db': patch
'@conciv/protocol': patch
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

A plugin can add a notice to a session with `session.synthetic`, as opencode's: the notice waits in the session's inbox, wakes an idle session into a turn (unless `resume: false`), goes in with the next run when a run is live or stopped, and the same `id` twice stores one notice. The model gets the notice text as a user message, a resumed CLI session included; the chat shows the notice as its own row labelled with its description, and hides one without a description. A notice is never a session's title: a session takes its first typed message as its title.
