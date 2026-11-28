---
'@conciv/backend-defaults': patch
'@conciv/simulation': patch
---

The engine starts when conciv is installed with npm. Every oRPC procedure is built with `.handler(handlerGen(fn))` from `@orpc/effect` instead of the `@orpc/effect/extensions/effect` prototype patch. npm can install several copies of `@orpc/server` (evlog's optional peer asks for a stable one), and the patch only reached the copy under `@orpc/effect`, so the dev server crashed with `os.auth.trust.effect is not a function`.
