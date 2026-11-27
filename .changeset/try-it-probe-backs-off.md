---
'@conciv/plugin-try-it': patch
---

With no local engine answering, the try-it plugin waits longer between probes, doubling the wait up to five times the probe interval, instead of probing every port every interval for as long as the page is open.
