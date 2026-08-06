---
'@conciv/extension-compiler': patch
---

The client/server split now follows the declaration that owns a handler instead of the method name
that terminates it. A module that declares a capability without declaring an extension is now
processed (the marker matches `defineExtension`, `defineTool` and `defineAttachment`), which closes a
leak that ran both ways: such a module used to ship its `.server()` handler, with its `node:*`
imports and system prompt, into the browser bundle, and its browser handler into the server bundle.
A `render`, `client`, `server` or `card` call is only collapsed when its receiver traces back,
through constant bindings only, to a `define*` call imported from `@conciv/extension`, so ordinary
code that happens to use those names survives both builds, and so does another library's builder
that happens to share a name with ours; `card`
joins the node strip set, so an attachment's card component no longer reaches the server. On the
server, the splitter runs as a jiti `transform` hook across the whole import graph, so a capability
declared in an imported module is split like one declared in the entry file. The one case per-module
receiver analysis cannot resolve is a terminator called on a binding imported from another module
(as in the recorder extension, which already pre-splits through its `./client` and `./server`
package exports); that is left untouched.
