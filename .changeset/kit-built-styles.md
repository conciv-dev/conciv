---
'@conciv/plugin-testkit': patch
---

Browser tests generate the widget's utility sheet once per run, from the app's UnoCSS config and the package under test's own source, instead of running UnoCSS over every module or reading the app's build output.
