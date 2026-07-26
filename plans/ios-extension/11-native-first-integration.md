# 11 — Native-first iOS integration: kill the vite config

## Problem

The iOS story currently bottoms out in a vite config block:

```ts
conciv({
  port: 4599,
  extensions: {
    ios: {projectRoot: ..., bundleId: 'dev.conciv.YourApp', simulator: 'iPhone 17 Pro'},
  },
})
```

This is wrong in three stacking ways:

1. **Every field is discoverable.** `projectRoot` is where the `.xcodeproj`/`Package.swift` lives;
   `bundleId` is in the project's build settings (`xcodebuild -showBuildSettings` already parsed by
   `ios.build`, which even selects the target by bundle id since the multi-target fix); `simulator`
   is "the booted one, else the newest available iPhone" (the tools already resolve UDID by name).
   Asking the user to transcribe facts the machine can read is config for config's sake.
2. **The host is a category error for pure iOS developers.** conciv-for-web reasonably lives in the
   web app's dev server. conciv-for-iOS currently requires: install Node, create a package.json,
   install vite + @conciv/it, write vite.config.ts, run pnpm dev — to serve a panel to an iPhone.
   An iOS developer has Xcode, not a vite project.
3. **It contradicts the SDK's own bar.** `ConcivWidget.attach()` is now zero-config; the server side
   asking for three hand-copied fields makes the weakest link the story.

## Design

Two milestones, independently shippable, ordered by leverage.

### M1 — auto-discovery inside the extension (removes the config, keeps the host)

The `ios` extension config becomes fully optional **including for the tools**:

- `projectRoot`: resolved by scanning upward/downward from the host cwd for `*.xcodeproj` /
  `Package.swift` with an app target (bounded depth, skip `node_modules`/`.build`/`DerivedData`).
  One match → use it. Multiple → tools fail with a one-line "several projects found, set
  extensions.ios.projectRoot" (explicit config stays as the override hatch, never the default path).
- `bundleId`: read from the discovered project via the existing `-showBuildSettings -json` parse
  (first app-wrapper target). Config overrides.
- `simulator`: booted simulator first, else newest available iPhone runtime. Config overrides.

Result: web-app-with-companion-iOS users delete the block entirely — the agent's `ios.build` /
`ios.run` just work. The docs accordion about configuration disappears; discovery failure messages
carry the exact override snippet instead.

Touchpoints: `packages/extensions/ios/src/server/tools.ts` (+ a small `discover.ts`), extension
config schema (all fields optional), server tests with fixture project trees, README + quick-start.

### M2 — standalone runner: `conciv` from the iOS project directory (removes the host)

A CLI that boots the dev core headless — no vite, no package.json, no Node project in the user's
repo:

```
cd MyApp/        # where MyApp.xcodeproj lives
npx conciv       # or: pnpm dlx conciv / bunx conciv
```

- Boots the same engine `start()` the plugin boots (the core is already host-agnostic behind
  `bootEngine`; the plugin is one caller, the CLI becomes a second — no fork of the engine).
- Registers the built-in extensions with the ios extension active; M1 discovery finds the project
  from cwd; serves `/native`, writes the pairing file; prints the endpoint and a "launch your app"
  hint.
- Harness preflight: detects the `claude` CLI (then other harnesses per the registry), with a clear
  install pointer when absent — the CLI's only real prerequisite.
- Packaging: a new small published package (`@conciv/cli`, bin `conciv`) whose implementation is a
  thin arg-parse + `start()` call. Joins `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`,
  fixed-version group, standard manifest (homepage/repository/directory), fallow `publicPackages`.
- Explicitly out of scope for M2: watch/HMR of the user's web code (there is none), multi-project
  selection UI, physical-device transport (still plan 10).

Quick start after M2 (the full story, including for someone with zero Node exposure):

1. Add the Swift package.
2. `ConcivWidget.attach()`.
3. `npx conciv` in the project folder, run the app in the simulator.

Web-host users keep their vite integration untouched — same engine, two front doors.

### M3 — later, deliberately unscheduled

Menu-bar/managed app, Xcode run-script auto-start, physical-device transports (plan 10), device
pairing by QR. Listed to keep them out of M1/M2 scope arguments.

## Decisions needed (owner)

- CLI name: `conciv` bin in a new `@conciv/cli` (recommended) vs subcommand of an existing package.
- npx-first docs (recommended: yes — no global install step) vs brew formula (later).
- M1 lands before or with M2 (recommended: M1 first; M2 consumes it unchanged).

## Sequencing vs PR #143

#143 merges as-is (the config block is already demoted to an optional accordion). M1+M2 are the
immediate next PR(s) on the same 0.0.x line; when M2 ships, the quick start's optional accordion is
deleted and replaced by the `npx conciv` step. Nothing in #143 blocks or is blocked by this plan.

## Task breakdown

- [ ] M1a: `discover.ts` — project scan + bundleId/simulator resolution + precise failure copy
- [ ] M1b: schema all-optional, tools thread discovery, override precedence tests
- [ ] M1c: docs — delete the config accordion, discovery-failure copy carries the override
- [ ] M2a: `@conciv/cli` package skeleton + publish wiring (guards, changeset, fallow)
- [ ] M2b: engine boot from CLI, harness preflight, endpoint/pairing output
- [ ] M2c: e2e: CLI-booted core + simulator demo app consume-loop (mirror of the SwiftPM e2e)
- [ ] M2d: quick start rewrite around `npx conciv`; mirror + extension READMEs
