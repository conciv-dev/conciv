---
'@conciv/backend-app-api': patch
---

The file watcher reads `CONCIV_PARCEL_WATCHER_PATH` as Effect Config when its native layer is built, so the value comes from the ConfigProvider the engine provides to the plugin host runtime. The unused `hasNativeBinding` export is gone.
