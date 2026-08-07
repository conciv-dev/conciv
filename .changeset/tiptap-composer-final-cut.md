---
'@conciv/ui-kit-chat': patch
---

The widget composer now runs on the TipTap rich text field from @conciv/ui-kit-tap: slash commands and mentions are atomic chips with typeahead popovers, lowering to the same directive strings the server always received. The string-splice trigger layer is removed from @conciv/ui-kit-chat (trigger popover primitives, slash/mention adapters, directive formatter, the styled composer popover slot); ComposerPrimitive.Input remains the plain textarea primitive.
