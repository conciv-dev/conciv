---
'@conciv/unplugin': patch
---

The engine port on Next.js, webpack and Rspack is no longer forced, and is picked per project. With no `port`, the engine prefers the port it used last time in the project, else a port picked from the project folder (one of 1000 from 24170 up), so two projects started at the same moment rarely ask for the same port. When that port (or the `port` you pass) is taken, the engine picks a free port before the widget is built, so the widget and the engine always use the same port and two projects can run side by side. `withConciv` is now async and returns a Promise of the Next config; `export default withConciv(nextConfig)` works as before, because Next accepts a Promise. On webpack and Rspack, an engine that fails to start now fails the build with the reason instead of leaving the page with no engine.
