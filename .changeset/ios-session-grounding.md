---
'@conciv/extension-ios': patch
---

Ground the agent in the iOS session it is serving. `defineExtension` now accepts a `systemPrompt` factory `(config, {cwd}) => string`, and the ios extension uses it to state the resolved project directory, bundle id, scheme, build mode, simulator, and working directory, and to rule out filesystem-wide scans such as `find /`.
