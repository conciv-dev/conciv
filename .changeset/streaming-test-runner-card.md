---
'@conciv/extension-test-runner': patch
---

test_runner card streams the run: per-test rows and pass/fail counts now update live from the runner's event stream instead of appearing only when the run finishes. Every test row and `test` event carries the runner's own stable case id (vitest `TestCase.id`, playwright spec id), so two cases that share a title in different suites of one file stay separate live rows instead of collapsing into one.
