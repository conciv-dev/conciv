---
'@internal/uno-preset': patch
'@conciv/app': patch
---

The same source now builds the same widget CSS and the same file names every time. Before, the theme variables in the widget's CSS came out in a different order from one build to the next, which changed every file name and broke installs that checked the package's checksum.
