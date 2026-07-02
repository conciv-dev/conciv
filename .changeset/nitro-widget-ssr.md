---
"@conciv/plugin": patch
---

Mount the dev-agent widget on SSR stacks (TanStack Start, with or without the nitro server layer) via the Vite module graph. Previously the widget was delivered by editing the served HTML (`transformIndexHtml` + a response-buffering middleware), which SSR hosts bypass — the engine booted and `/@conciv/extensions.js` served, but the widget never mounted. It now imports the extensions module from the framework's client entry and carries the engine origin in that module (`window.__CONCIV_API_BASE__`), so it works regardless of who renders the document. Zero config.
