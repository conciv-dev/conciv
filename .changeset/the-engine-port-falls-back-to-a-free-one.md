---
'@conciv/unplugin': patch
---

The engine port on Next.js, webpack and Rspack is no longer forced. When 24170 (or the `port` you pass) is taken, the engine picks a free port before the widget is built, so the widget and the engine always use the same port and two projects can run side by side. `withConciv` is now async and returns a Promise of the Next config; `export default withConciv(nextConfig)` works as before, because Next accepts a Promise. On webpack and Rspack, an engine that fails to start now fails the build with the reason instead of leaving the page with no engine.
