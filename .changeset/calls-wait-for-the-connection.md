---
'@conciv/protocol': patch
'@conciv/app': patch
---

Reloading while the dev server is still starting no longer leaves conciv cut off until another reload; logging in again after a revoke works on the first try. During a dev-server restart the panel may show the "couldn't reach the engine" screen sooner than before, and it now recovers on its own once the server is back. Logging in while conciv is still checking the connection no longer logs the page out a moment later. If the dev server never answers the login check, or a request for a login code, conciv now stops waiting after a few seconds: the chat still opens, and the login dialog says the request failed instead of staying silent.

Known limits: if the dev server accepts the connection but never answers the login check, the page shows a working chat but stays "unreachable" until the connection reopens or you press Retry. A magic-link code is not tried again after a page load that ended unreachable; reload the page to use it.
