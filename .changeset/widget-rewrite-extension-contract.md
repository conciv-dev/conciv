---
'@conciv/extension': patch
'@conciv/db': patch
'@conciv/core': patch
---

Extension contract v2: one doorway (HostProvider + useHost/useSlot) over a four-plane HostApi (state, chat, ui, page); manifest gains tables/composerActions/controls declarations. Extensions can declare ext_<id>_* TrailBase tables — @conciv/db (renamed from @conciv/state) generates their migrations and record APIs, core registers them at boot, and clients get cached TanStack DB collections via table(). @conciv/db adds a typed table registry (compile-time table/column safety, zod-parsed reads, schema-drift pin against the real sqlite file), sha256-verified TrailBase binary downloads, library-backed uuidv7 ids, and a CORS origin allowlist replacing --dev. extension-testkit provides a fake host implementing the hook API against the real state plane.
