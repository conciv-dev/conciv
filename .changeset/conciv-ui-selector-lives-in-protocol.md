---
'@conciv/protocol': patch
'@conciv/extension': patch
'@conciv/page': patch
---

`CONCIV_UI_SELECTOR` and `EFFECTS_SURFACE_ATTR` move to `@conciv/protocol/page-types` (new exports there). `@conciv/extension` re-exports both from protocol, so old extensions keep their import; `@conciv/page` imports them from protocol.
