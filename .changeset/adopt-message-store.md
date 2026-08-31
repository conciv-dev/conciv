---
'@conciv/db': patch
'@conciv/core': patch
---

Drizzle `MessageStore` and `MetadataStore` on the ai-persistence schema (`chat_threads`, `chat_metadata`), gated by upstream's `runPersistenceConformance`. `openDb` backfills every legacy `run_messages`/`image_history` row into one thread through `uiMessageToModelMessages`, moves anchor ids into metadata as `{nativeId}`, and records where the still-pending turn starts. The import is idempotent and leaves the legacy tables in place.

`chat_threads` is now the widget's single record of a session. The read-time merge of the CLI transcript with database-owned history is gone: a snapshot loads the thread and converts it back to UIMessages, and the CLI transcript reaches the widget only through an import that appends the turns the thread does not already hold. Nothing writes `run_messages` or `image_history` any more.
