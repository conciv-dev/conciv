---
'@conciv/types': patch
'@conciv/protocol': patch
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
---

A composer draft can hold structured items beside its text, attachments and quote: each item is a key and a JSON value. The chat kit's composer keeps them by key (`addItem` keeps the existing item when its key is already there, `updateItem` and `removeItem` change or drop one), and they come back after a failed send and after a reload. The engine's draft row stores them in a new nullable `items` column (an additive migration); a draft saved before this reads back with no items. The item's one shape is `DraftItemSchema` (type `DraftItem`) in `@conciv/types/chat-types`, which the draft row, the engine table and the kit's composer all read.
