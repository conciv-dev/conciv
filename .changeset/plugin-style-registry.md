---
'@conciv/backend-plugin-api': patch
---

The experimental SDK exports a `Style` registry: a plugin contributes CSS with `ctx.add(Style, css)`, importing the file with `?inline`, and the host applies it while the item is contributed.
