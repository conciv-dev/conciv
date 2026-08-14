---
'@conciv/extension': patch
---

Split the extension-facing and host-facing surfaces. `getExtensionApi(id)` now carries every host
hook alongside `useContext`, so extension code needs nothing else. `getHostApi`, `HostApiProvider`,
`HostWiring` and `ConnectHostApi` left the root barrel and now live on the new
`@conciv/extension/host` subpath, which only an app wiring the widget host imports.
