---
'@conciv/ui-kit-system': patch
---

Merge the `--pw-*` design-token namespace into `--chat-*`, leaving one custom-property family. CSS
custom properties, the ui-kit-system token module and its generated sheet, UnoCSS color/radius/font/
easing keys, shadow shortcuts, keyframe names and the xterm computed-style reads all move to the
`chat` prefix. The 25 colliding chrome/thread roles are unified or expressed as derived variants
rather than sibling literals.

Breaking for extension authors: theme override keys are renamed, `theme: {'pw-accent': …}` becomes
`theme: {'chat-accent': …}` and `'pw-hue'` becomes `'chat-hue'`.
