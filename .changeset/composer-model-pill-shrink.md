---
'@conciv/ui-kit-chat': patch
---

Let the composer's model picker shrink so Stop and Send stay reachable at phone widths. While a turn is running the composer shows Stop next to Send, and the action row had nothing that could give up space: the icon buttons are fixed size by design, and the model pill sat inside wrappers that were all sized to their full label. The row overflowed, and on a 320px phone the Send button was pushed off screen entirely. The pill now shrinks and truncates its label ("Claude Sonnet 4.5" becomes "Claude S...") so the whole row fits, which also removes the few pixels of overflow at 393px and on any narrower device.
