# @conciv/skills

## 0.0.23

### Patch Changes

- [#816](https://github.com/conciv-dev/conciv/pull/816) [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101) Thanks [@omridevk](https://github.com/omridevk)! - The widget bundles are now small classic-script loaders over shared, code-split ES chunks in `dist/widget/`, so mermaid, katex, shiki grammars, xterm and the chat highlight worker load only when used, and the IIFE source maps are gone (the embed `dist` drops from 152 MB to about 30 MB). Serve `dist/widget/` next to `conciv-widget.global.js`; the native page serves it automatically.

- [#849](https://github.com/conciv-dev/conciv/pull/849) [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9) Thanks [@omridevk](https://github.com/omridevk)! - An agent CLI that takes more than 10 seconds to print its first line (a cold start, a loaded machine) now finishes its turn instead of failing with "cannot attach to run ... delivered no bytes within 10000ms". The chat server no longer writes a run journal: the agent's output is read straight from its process, so the 30 second first-output limit ("the agent produced no output within 30s") is the only one. When that limit fails a turn, or the server is killed mid-run, the agent no longer keeps running in the background.

  `createChatServer` takes `sandbox: {dir}` (no `journalDir`), and `createChatPlane` no longer takes `stateRoot`.

## 0.0.22

No changes in this release.

## 0.0.21

### Patch Changes

- [#632](https://github.com/conciv-dev/conciv/pull/632) [`28155f7`](https://github.com/conciv-dev/conciv/commit/28155f74825e2c2ef01b22180c0f7aaff1a3854b) Thanks [@omridevk](https://github.com/omridevk)! - Point the conciv-develop tool contract reference at the consolidated extension test file.

- [#643](https://github.com/conciv-dev/conciv/pull/643) [`897350a`](https://github.com/conciv-dev/conciv/commit/897350a87c01d7159ba7ff5f1274c6478435ad84) Thanks [@omridevk](https://github.com/omridevk)! - Skills reference moved to the merged tanstack test helpers file.

## 0.0.20

No changes in this release.

## 0.0.19

### Patch Changes

- [#419](https://github.com/conciv-dev/conciv/pull/419) [`47732b4`](https://github.com/conciv-dev/conciv/commit/47732b46e486526e5faacef18523cd1ea61b964c) Thanks [@omridevk](https://github.com/omridevk)! - New `@conciv/skills` package ships first-party agent skills for conciv (setup, extension
  development, harness adapters, debugging) discoverable via `@tanstack/intent`, plus a CI-checked
  drift script that keeps skill citations in sync with the source they describe.
