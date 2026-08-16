---
'@conciv/ui-kit-chat': patch
---

Composer actions collapse into a shared overflow menu; extensions author buttons through ComposerActions.Root/Button/DropdownItem/Inline from @conciv/ui-kit-chat. ComposerActionsHost takes maxInlineAuto to cap how many auto actions may stay inline, and the conciv composer caps it at zero: only pinned buttons sit in the row. Session refresh moved out of the composer into pane chrome.
