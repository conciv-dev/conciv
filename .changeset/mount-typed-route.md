---
'@conciv/plugin-testkit': patch
'@conciv/app': patch
'@conciv/embed': patch
---

`mount`'s `route` is the app router's own navigate options, checked by TanStack Router (`{to: '/panel/latest', search: {open: true}}`), so a wrong path, a missing param or a wrong search value is a type error in the test. The app's memory navigation takes the same options and opens them with the router before the first render; the embed's servers mode passes its connect route that way.
