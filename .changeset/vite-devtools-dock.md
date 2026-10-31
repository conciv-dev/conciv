---
'@conciv/plugin': patch
---

Run conciv inside the Vite DevTools dock when DevTools is enabled. Without DevTools, the floating widget is unchanged.

One extension's client module failing to load (a content blocker, a network error, a throwing module) no longer stops the widget from mounting: the other extensions load, and a toast names the extension that failed. The recorder loads rrweb lazily, so a content blocker that blocks rrweb no longer takes the widget down; the Recorder tab explains the block instead.

The conciv dock pane is inert while another Vite DevTools entry is open, so the hidden chat no longer sits in the tab order or under the other entry's controls.

conciv follows the color scheme of the element it is mounted in, walking up from its mount point (across shadow roots) instead of reading only the page root, so in the Vite DevTools dock it matches the DevTools color mode.

The pop-out window survives a page reload: conciv re-attaches to the still-open window. When the window is gone or the browser blocks it, the chat returns inline for the same session with a "Pop out again" action, and closing the window returns to the inline chat. While popped out, the Vite DevTools dock shows "Chat is popped out" with a "Bring it back" action instead of an empty panel.

rrweb-snapshot loads lazily: a content blocker no longer blanks the widget. Element capture falls back to a descriptor, a toast names the likely blocker, and element previews explain the block in place.

The Vite plugin pre-bundles the modules the widget loads late (highlighter languages, rrweb, the Recorder player and others), so a first open on a cold cache no longer re-optimizes and reloads the page.

The dock keeps its settings when the host page already carries a conciv-widget meta tag, and closing a pop-out started from the quick terminal returns to a visible inline chat. A blocked replay player no longer hides a working recording: the Recorder tab keeps its actions and shows a replay notice.

The quick terminal shortcut brings the conciv dock entry forward when the dock is closed or another entry is selected, so the terminal is never opened behind a hidden panel.

Panel `open` and `toggle` commands bring the conciv dock entry forward when the dock is closed or another entry is selected.

Pop out opens its window inside the click, so browsers that only allow popups during a user gesture no longer block it. A blocked pop-out shows the "could not be reopened" notice with a Pop out again action.

A recording start that times out while rrweb is still loading no longer starts capturing once rrweb arrives, and a later start still records.
