---
'@conciv/embed': patch
---

The widget no longer mounts the UI of old SDK extensions: their panel views, view lock, status, composer and empty slots, slash commands, tool cards and attachment cards are gone, and so are the Views settings tab (with its hide, pin and order preferences and Reset views) and the generated extension settings pages (with Reset extension settings). Plugins add that UI through the plugin registries. A page-level extension `Surface` still mounts, for the iOS native shell's bridge.
