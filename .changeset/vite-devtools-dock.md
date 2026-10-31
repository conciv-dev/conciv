---
'@conciv/plugin': patch
---

Run conciv inside the Vite DevTools dock when DevTools is enabled. Without DevTools, the floating widget is unchanged.

One extension's client module failing to load (a content blocker, a network error, a throwing module) no longer stops the widget from mounting: the other extensions load, and a toast names the extension that failed. The recorder loads rrweb lazily, so a content blocker that blocks rrweb no longer takes the widget down; the Recorder tab explains the block instead.

The conciv dock pane is inert while another Vite DevTools entry is open, so the hidden chat no longer sits in the tab order or under the other entry's controls.

conciv follows the color scheme of the element it is mounted in, walking up from its mount point (across shadow roots) instead of reading only the page root, so in the Vite DevTools dock it matches the DevTools color mode.

The pop-out window survives a page reload: conciv re-attaches to the still-open window. When the window is gone or the browser blocks it, the chat returns inline for the same session with a "Pop out again" action, and closing the window returns to the inline chat. While popped out, the Vite DevTools dock shows "Chat is popped out" with a "Bring it back" action instead of an empty panel.
