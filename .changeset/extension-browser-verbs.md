---
'@conciv/extension': patch
---

Extensions can declare typed, zod-validated browser `pageVerbs` in `.client(...)` and invoke them from `.server(...)` via a scoped, fully-typed `server.page.call(verb, args)`. Every failure path rejects with a typed `PageVerbError` (`no-widget` | `unknown-verb` | `invalid-args` | `handler-error` | `timeout`). Core gains one generic `ext` page-query kind; no framework-specific code.

Supporting plumbing lands in sibling packages: `@conciv/page` exports the extension page-verb registry (`registerExtensionPageVerbs`/`unregisterExtensionPageVerbs`/`clearExtensionPageVerbs`/`bindExtensionPageVerbs`), the `rootFibers` React-tree walker, and the `dehydrate` serializer (depth/size caps plus secret-key redaction) that every browser verb runs untrusted values through. `@conciv/plugin` exports `makeViteBridge` (from `@conciv/plugin/vite`), a `BundlerBridge` whose `subscribe` emits the generic build/HMR/request-trace diagnostic stream that server-side inspection tools consume.
