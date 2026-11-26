---
'@conciv/backend-app-api': patch
---

A local TypeScript plugin is loaded the way Node loads TypeScript: enums, namespaces with code, parameter properties and `.tsx` files need building first, and such a plugin shows as failed to load. Installing conciv with pnpm no longer asks about esbuild's build script.
