---
'@conciv/plugin': patch
---

Run conciv inside the Vite DevTools dock when DevTools is enabled. Without DevTools, the floating widget is unchanged.

One extension's client module failing to load (a content blocker, a network error, a throwing module) no longer stops the widget from mounting: the other extensions load, and a toast names the extension that failed. The recorder loads rrweb lazily, so a content blocker that blocks rrweb no longer takes the widget down; the Recorder tab explains the block instead.

The conciv dock pane is inert while another Vite DevTools entry is open, so the hidden chat no longer sits in the tab order or under the other entry's controls.
