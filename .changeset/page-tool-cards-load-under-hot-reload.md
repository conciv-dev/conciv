---
'@conciv/plugin-page': patch
---

The page plugin's tool cards load when its source runs with Solid hot reload (Storybook, a dev server): the card list no longer reads the cards before they are defined, which failed with "Cannot access 'ReadValueCard' before initialization".
