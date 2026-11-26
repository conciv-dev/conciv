---
'@conciv/app': patch
'@conciv/plugin-test-runner': patch
---

After the engine connection drops and comes back, the Tests tab shows the run the engine reports, so a restarted engine with no run reads "No test run yet" instead of the last run from before the restart.
