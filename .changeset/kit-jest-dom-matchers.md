---
'@conciv/plugin-testkit': patch
---

The kit's happy-dom project loads the jest-dom matchers (`toBeVisible`, `toHaveAccessibleName`, ...) from its own dependency, and their types come with `@conciv/plugin-testkit/node`; browser mode keeps vitest's own matchers.
