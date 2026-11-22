---
'@conciv/plugin-testkit': patch
---

Every browser test ends on a fresh profile: the kit clears sessionStorage, localStorage, cookies, IndexedDB and Cache Storage and puts the page address back, after the app and any fixture have unmounted.
