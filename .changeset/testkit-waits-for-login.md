---
'@conciv/extension-testkit': patch
---

The extension test kit now hands a test its page only after the page has finished logging in to the engine. Tests that reloaded the page right away could cut the login short, leave the page logged out, and then time out waiting for the recorder to start.
