---
'@conciv/core': patch
---

The page bus now scopes every page-tool call to the calling session instead of broadcasting to every connected tab: a page query resolves only against the widget currently subscribed for that session, a fresh subscription for the same session replaces the previous one, and a session with no subscriber fails honestly with `NO_PAGE_CLIENT` instead of a second tab silently answering in its place. `os.page.queries` now takes a `sessionId` input and the widget resubscribes whenever the panel's active session changes. Edit-live page tools (`setattr`, `removeattr`, `addclass`, `removeclass`, `setstyle`, `settext`, `sethtml`, `remove`) now return the value read back from the element after the mutation instead of a bare `{ok: true}`, so a completed tool call reflects an effect actually observed on the page.

Server-tool extensions (e.g. `@conciv/extension-tanstack`) that call back into the page through their `tools` API now thread the calling session's id the same way `page` already did: `ServerToolCaller.call` and the tanstack `FrameworkAdapter`/`makeVerbCaller` chain take an explicit `sessionId`, so router/query-cache/navigation calls resolve against the widget actually subscribed for that session instead of silently defaulting to no session at all.
