---
'@conciv/mascot': patch
'@conciv/mascot-react': patch
---

The React mascot moves out of `@conciv/mascot` into its own `@conciv/mascot-react` package: import
`Mascot` from `@conciv/mascot-react` instead of `@conciv/mascot/react`. `@conciv/mascot` drops the
`./react` subpath and its optional `react`/`react-dom` peers, and gains `./adapter`, the core helpers
a framework wrapper builds on.
