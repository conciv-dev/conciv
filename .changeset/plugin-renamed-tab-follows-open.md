---
'@conciv/app': patch
---

A plugin tab opened by an old key that the plugin's panel renames (its `normalize`) now shows the renamed tab, also when the key is opened after the chat has loaded. Before, only a key already open when the plugin registered its panels was renamed, and a later `layout.open` of an old key left an empty tab.
