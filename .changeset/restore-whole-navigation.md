---
'@conciv/app': patch
'@conciv/storage-history': patch
---

The app restores the whole navigation the engine saved (every entry and the index), not only the current entry, so back and forward work after a reload. `createWebStorageHistory` gains `restore()`, which reads a storage that was filled after the history was created.
