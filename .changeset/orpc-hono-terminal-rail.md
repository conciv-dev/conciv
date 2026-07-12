---
'@conciv/contract': patch
'@conciv/db': patch
'@conciv/core': patch
'@conciv/serve': patch
'@conciv/ui-kit-terminal': patch
'@conciv/extension-compiler': patch
'@conciv/plugin': patch
---

Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

The terminal gains a narrative activity rail — a resizable, open-by-default timeline of session activity — and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.
