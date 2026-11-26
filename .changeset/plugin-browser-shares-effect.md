---
'@conciv/backend-plugin-api': patch
'@conciv/app': patch
---

A plugin's browser part shares the app's one copy of effect: `effect` is first in the modules the app provides to plugin browser parts. `@conciv/app` now lists `effect` as a dependency, because its mount build keeps effect external, so a host resolves it, as it does solid-js.

The widget grows with it. Measured in gzip bytes, first load (the loader plus what it statically imports) goes from 1,887,640 to 2,161,184, 273,544 more (about 267 KB); the whole widget (every file it can load) goes from 6,064,594 to 6,339,232, 274,638 more. Uncompressed, first load goes from 5,843,399 to 6,759,866 and the whole widget from 24,537,618 to 25,456,339.
