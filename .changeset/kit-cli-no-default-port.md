---
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

`cli()` takes the test's `engine` and reaches it by its address, and a call given no engine, folder or port gets a closed local port, so it never reaches a real dev server on 5173.
