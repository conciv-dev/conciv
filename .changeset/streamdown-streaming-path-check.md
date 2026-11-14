---
'@conciv/solid-streamdown': patch
---

`localFileExists` is no longer asked about the inline-code paths of the block still streaming when `animated` is `false`: the last block counts as streaming while `isAnimating` is true, whatever `animated` is, and its paths are asked once streaming ends.
