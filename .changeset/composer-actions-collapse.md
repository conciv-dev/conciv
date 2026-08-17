---
'@conciv/ui-kit-chat': patch
---

Composer actions collapse into a shared overflow menu; extensions author buttons through `ComposerActions.ActionButton` (or the `ComposerActions.Action` + `ActionMenuItem` pairing for divergent inline/menu content) and `ComposerActions.Inline` from @conciv/ui-kit-chat, registered with the host via context — no ids, no separate menu-item JSX to author by hand. `ComposerActionsHost` takes `maxInlineAuto` to cap how many unpinned auto actions may stay inline, and the conciv composer caps it at zero: only `visible="always"` buttons sit in the row. Session refresh moved out of the composer into pane chrome. `ComposerActionsHost` reads its regions from the `ComposerActions.Leading`, `ComposerActions.Trailing` and `ComposerActions.Trigger` slot components instead of leading/trailing/triggerContent props.
