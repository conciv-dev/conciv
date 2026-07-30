---
'@conciv/it': patch
---

Restore pairing-file discovery for hosts that install @conciv/it. A dev core again writes
`~/.conciv/dev-endpoint.json`, so the iOS SDK finds the running dev server instead of falling back to
probing a fixed list of ports. The temporary-directory location that 0.0.16 forced on every run is
now a plugin option, `devEndpointDir`, that a host sets when it wants the pairing file elsewhere.
