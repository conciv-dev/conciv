---
'@conciv/solid-diffs': patch
---

Pace streamed diff renders. A file whose contents keep growing during a stream now re-tokenises at most once every 100ms instead of on every chunk, and the trailing edge always renders the final content so the settled diff is byte-for-byte what it was before.
