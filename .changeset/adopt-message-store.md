---
'@conciv/db': patch
---

Drizzle `MessageStore` and `MetadataStore` on the ai-persistence schema (`chat_threads`, `chat_metadata`), gated by upstream's `runPersistenceConformance`. `openDb` backfills every legacy `run_messages`/`image_history` row into one thread through `uiMessageToModelMessages`, moves anchor ids into metadata as `{nativeId}`, and records where the still-pending turn starts. The import is idempotent and leaves the legacy tables in place.
