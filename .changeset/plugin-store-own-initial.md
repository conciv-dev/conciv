---
'@conciv/app': patch
---

A plugin store whose record has an entry named like a built-in object member (`constructor`, `toString`) that fails its schema now drops only that entry. Before, the store read the built-in as that entry's initial value and reset the whole store.
