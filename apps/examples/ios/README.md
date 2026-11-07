# ios

## Overview

Minimal host for the iOS overlay: a bare Vite dev server whose only job is to run the conciv
engine with the `ios` extension pointed at the [ConcivDemo](../../../native/swift/ConcivDemo/README.md)
simulator app. There is no web page; the overlay loads the engine's own `/native` page inside the app.

## Run it with ConcivDemo

1. Start the engine from the repo root and leave it running:

   ```bash
   pnpm --filter ios-example dev
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

- `vite.config.ts`: the iOS `projectRoot` is `../../../native/swift/ConcivDemo` and `extraSourceDirs` is
  `../ConcivWidget/Sources/ConcivWidget`; moving either breaks the iOS extension
- This is the only example that installs the `ios` extension, so web sessions on other examples never
  get the iOS overlay system prompt

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=ios-example` from the repo root (the package has no
  `test` script)
