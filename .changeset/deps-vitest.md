---
'@conciv/extension-page': patch
---

Tests run on vitest 5.0.5 (with the unreleased vitest#11709 fix patched in). Browser assertions follow vitest 5's strict
text matching, and the page extension's React test project sets its JSX transform through `oxc`.
