---
'@conciv/backend': patch
'@conciv/backend-defaults': patch
'@conciv/harness': patch
'@conciv/simulation': patch
'@conciv/types': patch
'@conciv/protocol': patch
'@conciv/client': patch
'@conciv/ui-kit-chat': patch
'@conciv/skills': patch
'@conciv/app': patch
---

A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.
