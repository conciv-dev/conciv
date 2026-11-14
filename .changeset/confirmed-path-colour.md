---
'@conciv/ui-kit-chat': patch
'@conciv/solid-streamdown': patch
---

A file path in a chat message that the host confirmed exists now shows in opencode's code-path blue (`#2c47c8` in light mode, `#c3d4fd` in dark mode, the new `--chat-code-path` token), fading into it once the check answers (no fade under reduced motion). When the host can open files, the path shows a pointer and underlines on hover with opencode's underline (the path's blue at 40%, offset 2px), and a local file link shows a pointer. `@conciv/solid-streamdown`'s `styles.css` no longer styles local links or confirmed paths; the chat theme does.
