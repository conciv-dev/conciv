---
'@conciv/backend-test-utils': patch
---

The test kit's typecheck and build wait for the builds of the packages it reads through the app's source, so a cold build no longer races them.
