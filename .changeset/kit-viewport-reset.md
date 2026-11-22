---
'@conciv/plugin-testkit': patch
---

A browser test that changes the viewport no longer leaks it into the next test: after each test the kit puts the viewport back to the configured 1280x800, read from the same constant the browser project's config uses.
