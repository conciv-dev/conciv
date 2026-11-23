---
'@conciv/harness': patch
---

The Claude login status is held. A send reads it at once and never waits on a probe; only the very first check, before any answer is held, waits for the probe. A check that finds a logged-out answer starts one re-check in the background, shared by every caller, and its answer replaces the held one when it lands, so the menu open or the refused send after `claude auth login` makes the next send run.
