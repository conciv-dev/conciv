---
'@conciv/plugin-testkit': patch
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

`mount({engine, history})`: `createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})` from `@conciv/plugin-testkit/browser` writes its current entry as the tab's last screen in sessionStorage and the app restores it as a reload does in production; any TanStack `RouterHistory` (`createMemoryHistory`) is used as the app router's history and stays a handle for the test. The app's `Platform.navigation` memory form is now `{history: RouterHistory}`, and the embed's servers mode builds its own memory history for the connect path.
