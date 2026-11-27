# @conciv/publish

## 0.0.23

### Patch Changes

- [`fe5b3cc`](https://github.com/conciv-dev/conciv/commit/fe5b3ccddb071fbf5021a1f1e2312edcd92c2fec) Thanks [@omridevk](https://github.com/omridevk)! - The app no longer provides `@conciv/ui-kit-tap` to plugin bundles: a plugin bundle that imports it now fails to build, as any other kit module does. A plugin's `./plugin-experimental` bundle keeps every field of its default export through to the app, not only `stores` and `setup`. `SetupContext<typeof definition>` types `ui` from the definition's own setup, so `usePlugin<typeof definition>()` sees the components that setup sees. conciv's own first-party plugins get the chat's tool row, error text, truncated text, status dot, JSON view, zoomable image and mention field on `ctx.ui`; third-party plugins keep the documented `ctx.ui`. The whiteboard plugin's thread reply uses the mention field from `ctx.ui`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `start.timeouts` takes any one timeout (`Partial<Pick<StartOpts, ...>>`). `check-turbo-depends-on` now counts a dist read through another package's built types, so a kit consumer's typecheck waits for every dist the kit's types import.

## 0.0.22

No changes in this release.

## 0.0.21

No changes in this release.

## 0.0.20

No changes in this release.

## 0.0.19

## 0.0.18

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

## 0.0.10

## 0.0.9

## 0.0.8

## 0.0.7

## 0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

## 0.0.4

## 0.0.3

## 0.0.2

## 0.0.1
