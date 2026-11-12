---
'@conciv/extension-recorder': patch
---

The recorder's Timeline keeps its length current while playback is paused. The length now updates when the replayer has actually added or played an event, so the newest batch of a live recording shows on the paused Timeline without waiting for another batch to arrive.
