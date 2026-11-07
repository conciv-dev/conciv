---
'@conciv/ai': patch
'@conciv/client': patch
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/chat': patch
'@conciv/db': patch
'@conciv/protocol': patch
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
'@conciv/app': patch
---

Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.
