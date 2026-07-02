# @conciv/plugin

## 0.0.3

### Patch Changes

- [#5](https://github.com/conciv-dev/conciv/pull/5) [`2d67cc9`](https://github.com/conciv-dev/conciv/commit/2d67cc9785da2274f503c77c839777cc30147e34) Thanks [@omridevk](https://github.com/omridevk)! - Mount the dev-agent widget on SSR stacks (TanStack Start, with or without the nitro server layer) via the Vite module graph. Previously the widget was delivered by editing the served HTML (`transformIndexHtml` + a response-buffering middleware), which SSR hosts bypass — the engine booted and `/@conciv/extensions.js` served, but the widget never mounted. It now imports the extensions module from the framework's client entry and carries the engine origin in that module (`window.__CONCIV_API_BASE__`), so it works regardless of who renders the document. Zero config.

- Updated dependencies []:
  - @conciv/cli@0.0.3
  - @conciv/core@0.0.3
  - @conciv/extension@0.0.3
  - @conciv/protocol@0.0.3
  - @conciv/widget@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/cli@0.0.2
  - @conciv/core@0.0.2
  - @conciv/extension@0.0.2
  - @conciv/protocol@0.0.2
  - @conciv/widget@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/cli@0.0.1
  - @conciv/core@0.0.1
  - @conciv/extension@0.0.1
  - @conciv/protocol@0.0.1
  - @conciv/widget@0.0.1
