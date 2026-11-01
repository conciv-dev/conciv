# packages/extensions

## Overview

Each subdirectory is a separate pnpm package with its own `package.json`, build (tsdown and/or vite) and test scripts. The packages are design (visual diff against a target image), ios (iOS simulator tools and the WKWebView bridge), page (the `page_*` DOM and React tools), recorder (rrweb recording and replay), tanstack (TanStack Router and Query inspection), terminal (harness TUI over a server pty), test-runner (runner-agnostic test adapters), try-it (private conciv.dev connect demo) and whiteboard (shared Excalidraw canvas with source-anchored comments). Apart from try-it, which is private, the package descriptions say they are installed through `@conciv/it` and not directly.

## Subdirectories & Boundaries

- [try-it](./try-it/README.md): Private `@conciv/extension-try-it` package: the conciv.dev demo extension that shows guided connect steps in the widget panel and probes for a local agent core.
- [design](./design/README.md): Package root of `@conciv/extension-design`. It holds the build configs for the server/defs/provenance bundles (tsdown), the browser client bundle (vite), the xray Solid page (vite + UnoCSS) and declaration emit.
- [page](./page/README.md): Package root of `@conciv/extension-page` v0.0.21, the built-in conciv extension that exposes every `page_*` verb as a `defineTool()` declaration, with config files only at this level.
- [tanstack](./tanstack/README.md): Package root of `@conciv/extension-tanstack` (v0.0.21), a conciv extension that inspects TanStack Router/Start apps and exposes router state, loader data and the query cache to the widget.
- [whiteboard](./whiteboard/README.md): Package root of @conciv/extension-whiteboard: build, test, lint and drizzle configs plus package.json for an Excalidraw whiteboard extension with a server entry (src/server.ts) and a browser client entry (src/client.tsx).
- [terminal](./terminal/README.md): Package root for `@conciv/extension-terminal`, a built-in extension that shows a live harness TUI over a server-side pty.
- [ios](./ios/README.md): Package root for `@conciv/extension-ios` (v0.0.21). It holds the package manifest and the tsdown, vite, vitest and tsc build and test configs.
- [test-runner](./test-runner/README.md): Package root of `@conciv/extension-test-runner`: the built-in test-runner extension for @conciv/it. Its configs build a server/runner ESM bundle with tsdown, a Solid client bundle with vite and declarations with tsc, and they set up node IT and browser test projects in vitest.
- [recorder](./recorder/README.md): Package root of @conciv/extension-recorder, the built-in recorder extension. It records the host page with rrweb, keeps a server-side sliding window of events, gives agents tools that return an action log, and shows a replay panel.
