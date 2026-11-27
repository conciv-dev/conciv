---
'@conciv/frontend-plugin-api': patch
'@conciv/react': patch
'@conciv/preact': patch
'@conciv/app': patch
---

Plugin UI in any framework, as TanStack Devtools: `mountRender(mount)` in `@conciv/frontend-plugin-api` turns a framework-free `(element, props) => cleanup` mount into the render every registry takes. `reactRender(Component)` in `@conciv/react` and `preactRender(Component)` in `@conciv/preact` draw a component as a panel, settings page, slot, composer pill menu, code block or tool card, through a portal inside `<ConcivWidget/>`'s tree, so the host app's providers reach it and its props stay live. `@conciv/react` now needs React 18 or later.
