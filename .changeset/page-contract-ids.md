---
'@conciv/backend-plugin-api': patch
---

The page plugin's contracts take its id as their namespace, as every plugin's contracts do: `Page` is `conciv.page` and `ReactTree` is `conciv.page.react`, so the page plugin (now `conciv.page` in the window too) may provide them.
