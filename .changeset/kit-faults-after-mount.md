---
'@conciv/plugin-testkit': patch
---

The happy-dom `faults` fixture depends on `mount`, so a test that ends with the engine paused resumes it before the app unmounts, whatever order the test lists the two in.
