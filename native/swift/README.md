# swift

## Overview

Swift sources: the ConcivWidget iOS SDK package and the ConcivDemo app that consumes it. This folder is
also the iOS example host (package `ios-example`): a bare Vite dev server whose only job is to run the
conciv engine with the `ios` extension pointed at ConcivDemo. There is no web page; the overlay loads the
engine's own `/native` page inside the app. The engine's working directory is this folder, so the agent can
edit both the demo app and the SDK sources.

## Subdirectories & Boundaries

- ConcivDemo: [ConcivDemo/README.md](./ConcivDemo/README.md) - iOS simulator demo app built with plain `swiftc` (no Xcode project), compiled together with the real ConcivWidget sources. The iOS extension configured in `vite.config.ts` points at this folder.
- ConcivWidget: [ConcivWidget/README.md](./ConcivWidget/README.md) - Swift package `ConcivWidget` (tools 5.9, iOS 17): the iOS SDK library and its XCTest target.

## Run it with ConcivDemo

1. Start the engine from the repo root and leave it running:

   ```bash
   pnpm exec turbo run dev --filter=ios-example
   ```

2. Launch the demo app in the simulator, either from the agent panel (`ios_build`, then `ios_run`,
   which injects `CONCIV_URL` for you) or by hand:

   ```bash
   native/swift/ConcivDemo/run.sh
   ```

   The app finds the engine through the pairing file `~/.conciv/dev-endpoint.json`, or by probing port
   4599 first. Run only one conciv dev server while you use the demo: every dev core writes that
   pairing file, and the last one started wins.

## Interface

- `conciv({port: 4599, extensions: {ios: ...}})` (`vite.config.ts`): engine on port 4599 (the first port
  the Swift SDK probes), iOS extension with `bundleId: 'dev.conciv.ConcivDemo'`,
  `simulator: 'iPhone 17 Pro'`, `buildMode: 'swiftc'`
- scripts (`package.json`): `dev`, `typecheck`, `lint`

## Invariants

- `vite.config.ts`: the iOS `projectRoot` is `./ConcivDemo` and `extraSourceDirs` is
  `../ConcivWidget/Sources/ConcivWidget` (relative to `projectRoot`); moving either breaks the iOS extension
- The engine's cwd is this folder and the agent's harness may only write inside it, so every Swift file the
  agent edits must live under `native/swift`
- `vite.config.ts`: the Vite watcher ignores `ConcivDemo/**` and `ConcivWidget/**`, so Swift build trees never
  flood it; nothing in the host imports those folders
- This is the only example that installs the `ios` extension, so web sessions on other examples never
  get the iOS overlay system prompt
- `pnpm-workspace.yaml` lists `native/swift` by exact path, so the Swift package folders below it never
  become workspace packages

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=ios-example` from the repo root (the package has no
  `test` script)
