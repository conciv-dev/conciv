---
'@conciv/core': patch
'@conciv/client': patch
'@conciv/app': patch
---

The chat hydrate, stop, permission decision and ui reply procedures are also served as conciv:chat:* hub functions beside oRPC, with the same error codes. The widget sends those four calls over the hub; the chat event stream stays on oRPC. Hub routing in the client accepts single procedures as well as whole groups.
