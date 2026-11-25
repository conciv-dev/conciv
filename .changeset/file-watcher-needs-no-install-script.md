---
'@conciv/backend-app-api': patch
---

Installing conciv with pnpm 11 no longer stops on `@parcel/watcher`'s install script. The file watcher now uses the prebuilt binary for your platform, and when none matches it falls back to Node's own watcher.
