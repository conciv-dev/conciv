---
'@conciv/plugin-testkit': patch
'@conciv/app': patch
'@conciv/embed': patch
---

`mount({engine, history})`: `createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})` from `@conciv/plugin-testkit/browser` saves the entries in the engine through `navigation.set` and the app restores them as it does in production; any TanStack `RouterHistory` (`createMemoryHistory`) is used as the app router's history and stays a handle for the test. The app's `Platform.navigation` memory form is now `{history: RouterHistory}`, and the embed's servers mode builds its own memory history for the connect path.
