---
'@conciv/ui-kit-chat': patch
---

Stop re-rendering every settled trace row on each stream chunk: per-row result and duration lookups are value-stable memos, the live-row key and derived row class names are memoized, and the trace rail writes only changed attributes.
