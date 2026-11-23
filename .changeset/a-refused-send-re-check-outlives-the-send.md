---
'@conciv/harness': patch
---

The background re-check of a logged-out Claude login no longer follows the signal of the check that started it, only its own 30 second bound, so the re-check a refused send starts lands after the send has ended and the Retry runs.
