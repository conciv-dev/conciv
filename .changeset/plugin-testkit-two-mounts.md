---
'@conciv/app': patch
---

The testkit has two entries with one export each: `@conciv/plugin-testkit/node` exports `createEngine` (the real engine with the plugins and a scripted AI), and `@conciv/plugin-testkit/browser` exports `mount` (the whole app on that engine, in happy-dom or vitest browser mode). Every helper export, the `/flow` entry and the old fixtures are removed.

In browser mode each test gets `pageErrors()` on its test context, as opencode's `trackPageErrors`: the page's console errors, uncaught errors and failed responses (status 400 or more) so far, for the test to assert on when it wants to.
