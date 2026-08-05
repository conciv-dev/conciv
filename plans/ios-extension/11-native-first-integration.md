# 11: Native-first iOS integration (kill the vite config)

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

A vite config for an iOS app is a category error, in three stacking ways:

1. **Every field is discoverable.** The project location, the bundle id, and the simulator are all facts
   the machine can read from the project and the running system. Asking the user to transcribe them is
   config for config's sake.
2. **The host is wrong for pure iOS developers.** conciv-for-web reasonably lives in the web app's dev
   server. conciv-for-iOS currently demands Node, a package.json, vite, `@conciv/it`, a
   `vite.config.ts`, and `pnpm dev`, all to serve a panel to an iPhone. An iOS developer has Xcode, not
   a vite project.
3. **It contradicts the SDK's own bar.** `ConcivWidget.attach()` is zero-config; the server side asking
   for three hand-copied fields is the weakest link.

## Decisions (settled by owner)

- **No new npm package.** The published `@conciv/cli` (bin `conciv`, live at 0.0.15, already in
  `PUBLIC_PACKAGES`, the fixed changeset group, and fallow) gains a `start` subcommand next to `tools`.
  Invocation is `npx @conciv/cli start`; nobody types it by hand (the launcher runs it).
- **The launcher, shipped inside the Swift package, is the user-facing mechanism.** The mirror repo
  `conciv-dev/conciv-swift` (assembled from `native/swift/ConcivWidget`) ships a small launcher script.
- **The launcher hides engine acquisition.** Now it runs `npx -y @conciv/cli start`. In M3 its internals
  swap to a signed, notarized, self-contained binary (Node-free) with zero user-visible change.
- **#143 merges first.** This is the immediate next PR set on the 0.0.x line.

## What today's code actually does

Grounding, because earlier drafts overstated this. New behavior below is written as new, not as
existing.

- **Pairing file is a single global record.** `packages/core/src/lib/dev-endpoint.ts` writes one
  `~/.conciv/dev-endpoint.json` of `{apiBase, token, pid}`; a second writer atomically replaces the
  first, and `removeDevEndpoint(dir, pid)` is single-file and pid-based.
- **`start()` picks then binds.** It calls `getPort()` and binds in a separate step
  (`packages/core/src/start.ts`), so there is a small selection race. It already supports an
  `accessToken` mounted under `/t/<token>` and writes the token-scoped `apiBase` into the pairing file.
- **Absent config means no system prompt.** `composeSystemPrompt` uses `extensionConfigured`, which
  treats a config that parses to `undefined` as inactive (`start.ts` around lines 51 to 66). The ios
  schema preprocesses an empty or missing config to `undefined`, so with no config the extension is
  inactive for the prompt even if its tools register.
- **`ios.build` does not discover a target.** It filters `-showBuildSettings -json` by the already
  configured `bundleId` (`tools.ts` `appTargetPath`, around lines 92 to 100).
- **Simulator resolution is name/UDID, preferring booted.** `resolveUdid` matches the configured or
  default simulator name or UDID and prefers a booted match (`tools.ts` around lines 258 to 266). It is
  not "booted else newest available iPhone."
- **Built-in composition lives in `@conciv/it`, not core.** `packages/it/src/plugin-instance.ts`
  assembles terminal, test-runner, whiteboard, and ios, sets `nativePageDir` to the embed dir, and
  passes it to the plugin. `@conciv/core` depends on none of the extensions or `@conciv/embed`, and
  `nativePageDir` is what turns on `/native` and pairing-file emission. `@conciv/cli` lists `@conciv/core`
  as a devDependency only.
- **The simulator-to-host file transport is proven** (spike, 2026-07-26, Xcode 17F113 / iOS 26.5 sim).
  The Swift SDK (`native/swift/ConcivWidget/Sources/ConcivWidget/Discovery.swift`) reads
  `SIMULATOR_HOST_HOME/.conciv/dev-endpoint.json`, and the spike ran that path for real with zero env
  injection: `SIMULATOR_HOST_HOME=/Users/omrikatz` is present in the app env under both `simctl launch`
  and a tap/SpringBoard launch (SpringBoard's own procinfo carries it, children inherit); sim apps run
  as the host user and share the host filesystem, so the sandboxed app read the file directly, parsed it,
  hit `/health` (200), and rendered the panel. The existing demo also passed the URL through
  `SIMCTL_CHILD_CONCIV_URL` (read as `CONCIV_URL`); that is now an optional override, not the
  requirement.

## Design

Ordered so the two foundational unknowns (transport and pairing identity) are proven before any launcher
or CLI work. Each phase maps one-to-one to a task in the breakdown.

### P-a: transport (proven) plus the versioned pairing contract

**The transport is proven** (spike, 2026-07-26, Xcode 17F113 / iOS 26.5 sim), tokenless and
token-scoped, with zero env injection. On the Simulator a sandboxed app:

1. read the host pairing data under `SIMULATOR_HOST_HOME/.conciv/dev-endpoint.json` directly (the sim
   app runs as the host user and shares the host filesystem; `SIMULATOR_HOST_HOME` is present under both
   `simctl launch` and a tap/SpringBoard launch),
2. reached `/t/<token>/health` on the tokenized `apiBase` (pairing file carried
   `apiBase=http://127.0.0.1:4701/t/spiketok123`),
3. loaded `/t/<token>/native` in the WKWebView,
4. kept the `/t/<token>` prefix on follow-up traffic (the SDK already forwards the token field into the
   widget handshake).

So P-a no longer has to prove the transport; the remaining P-a work is (1) converting the spike into a
permanent automated e2e (moved to P-g) and (2) the versioned pairing contract below.

Token trap, confirmed by the same spike: the unprefixed `/health` returns 404 when the core is tokenized,
so the SDK's port-probe fallback cannot recover a tokenized core (probe candidates have no token and
every route lives under `/t/<token>`). Port-probe fallback stays explicitly dead for tokenized cores.

Hard caveat: this is Simulator-only by construction. A physical device has no `SIMULATOR_HOST_HOME` and no
host-filesystem sharing, so device transport remains plan 10 and needs launch-environment injection or
another channel.

**Versioned, atomic, multi-entry pairing contract.** Replace the single record with a versioned
collection:

- Shape: `{version, entries: PairingEntry[]}`. `PairingEntry` = `{bundleId, apiBase, token, pid,
startedAt, projectRoot?}`. `apiBase` carries the `/t/<token>` prefix when a token was minted.
- **Primary key is `bundleId`.** It is the only identity both sides share: the SDK has
  `Bundle.main.bundleIdentifier`, but cannot reliably know the Mac-side `.xcodeproj` or workspace path
  at runtime. `projectRoot` is secondary metadata only, never the SDK's required matching input.
- Writes are atomic read-modify-write under a lock file (upsert this run's entry by `bundleId`; write to
  a temp file then rename, matching the current atomic write).
- Stale entries are pruned on every write by pid liveness (drop entries whose pid is dead).
- Cleanup ownership: the writer that created an entry removes it on shutdown; a dead-pid entry is fair
  game for any later writer to prune.
- Duplicate `bundleId` (two live cores for the same app): last writer wins the entry and the earlier
  server logs a loud warning; the SDK reads exactly one entry per bundle id.
- This is not additive over the old shape, so core and Swift change together in one PR: the version
  field gates the reader, and the Swift `DevEndpointFile` decoder becomes a collection decoder that
  selects the entry for `Bundle.main.bundleIdentifier`.

### P-b: endpoint collection semantics in core and Swift

Implement the contract from P-a: the core write path upserts and prunes under the lock; the Swift
`ConcivDiscoverer` selects by bundle id and drops the pid-equality re-point logic onto per-entry pid.
Tests cover concurrent writers, dead-pid pruning, duplicate bundle id, and version mismatch.

### P-c: discovery plus absent-config activation (including the system prompt)

**Discovery model.** A `discover.ts` in the ios extension returns structured candidates, not a single
guess. Each candidate carries `{workspace?, project, scheme, target, bundleId, runtime}` plus the reason
it qualified. Enumeration uses the real tooling: `xcodebuild -list -json` to list schemes and targets,
explicit `-workspace` or `-project` on every query, per-scheme `-showBuildSettings -json`, and
product-type validation (`PRODUCT_TYPE` equals `com.apple.product-type.application`) to pick the app
target. This is new behavior: today's tools filter by the configured bundle id and never enumerate.

Selection is deterministic by proximity, in strict precedence:

1. explicit override,
2. exact cwd container (the directory holding the `.xcworkspace` or `.xcodeproj`; a workspace wins over a
   loose project in the same directory),
3. nearest ancestor workspace or project,
4. narrowly bounded descendants (bounded depth, skipping `node_modules`, `.build`, `DerivedData`).

Ambiguity at the winning tier reports every candidate and why it qualified, with the exact override
snippet to paste. A bare `Package.swift` is a non-goal: a SwiftPM package is not an iOS app, so it never
counts as a candidate.

**Simulator resolution (new).** When unset, prefer a booted iOS simulator, else the newest available
iPhone runtime. This is new; today's code only matches the configured or default name/UDID.

**Absent-config activation contract.** Activation must span three surfaces, not two: tool registration,
server context, and system-prompt inclusion. Registering the tools while `composeSystemPrompt` still
treats the extension as inactive would hand the harness the ios tools but drop the ios instructions
(screenshots, native-overlay interpretation). This needs a core change: activation is decided by a
discovery-backed predicate (the extension is active when it has usable config OR discovery resolves a
project), applied consistently to tool registration, the server tool context, and the system prompt.
Ships with tests that assert the prompt includes the ios instructions when discovery succeeds and config
is absent.

**Partial-override merge.** Making `projectRoot` and `bundleId` optional creates partial configs. Merge
is field by field over `{projectRoot, scheme, bundleId, simulator}`: any provided field pins and the rest
resolve by discovery. A provided field that contradicts discovery (a `bundleId` not among the discovered
app targets, a `projectRoot` with no app target) is a hard error listing the discovered candidates, not a
silent override.

**Cache.** Resolved config is immutable per process. Discovery runs lazily on the first ios tool call and
is cached for the rest of that run; there is no in-process reload, so no "invalidated by config change"
wording.

### P-d: shared boot composition in the right layer

The built-in composition belongs to `@conciv/it` (`plugin-instance.ts`), and core deliberately depends on
none of the extensions or embed. So the shared boot factory does NOT go in core and is NOT a new package.
Define a dependency-safe composition module exported from `@conciv/it` (the existing published higher-level
package) that assembles the built-in extensions, resolves `nativePageDir` from the embed entry, and calls
`start()`. Both the vite plugin and the CLI consume it.

`@conciv/cli` must gain the runtime dependencies this pulls in: `@conciv/it` (or, if the module is
factored below it, `@conciv/core`, `@conciv/embed`, `@conciv/extension-ios`, the other built-ins, and the
harness registry `@conciv/harness`). `@conciv/core` moves from devDependency to a real dependency of the
CLI on whichever boundary is chosen. List and wire these explicitly; the CLI cannot boot a core today.

### P-e: the `start` subcommand (deps, preflight, port policy, machine-readable mode)

A `start` command in `packages/cli` (next to `tools` in `bin.ts`), a thin arg-parse over the P-d factory.
It:

- generates a per-run cryptographic auth token by default and writes the tokenized pairing entry;
- port policy: prefer a direct port-0 bind to close the current pick-then-bind race (a change from
  today's `getPort()`), accept `--port` to pin, and print a useful diagnostic on a conflict;
- harness preflight that is authenticated and usable, not merely on PATH. Precedence is `--harness`, then
  the `CONCIV_HARNESS` env var, then the Claude default (the config source is options plus env in
  `resolveConfig`; there is no on-disk config loader in this path, so do not imply one). The probe is a
  per-harness, non-destructive capability check with a timeout and defined exit-code interpretation;
  unsupported or unauthenticated harnesses fail with a specific message, never a silent first-installed
  pick;
- signal handling for the foreground case: SIGINT/SIGTERM remove this run's pairing entry and stop the
  server (the detached launcher case is handled in P-f, where signals do not arrive);
- CI/noninteractive mode behind `--json` (or `--ci`): a versioned JSON readiness object on stdout
  (schema `{version, ready, apiBase, bundleId, port, harness, pairingFile}`), human logs on stderr, and
  defined exit codes (0 ready, non-zero per failure class). Flags: `--project`, `--port`, and
  `--simulator-udid`, which maps onto the existing `simulator` config field (it already accepts a UDID or
  a name).

Prerequisites the CLI checks and reports: macOS, Xcode plus an installed iOS simulator runtime, `xcrun`,
and Node >= 22.13 (until M3).

### P-f: the launcher script plus mirror assembly

**The exact pasted line and checkout derivation (fixture-tested).** The mirror package ships an
idempotent launcher; the user pastes ONE scheme pre-action line that invokes it. M2c must produce and
fixture-test:

- The exact command, with every path double-quoted so spaces survive. The proven checkout formula
  (spike, 2026-07-26, Xcode 17F113 / iOS 26.5 sim) is
  `CHECKOUTS="$(cd "$BUILD_DIR/../../SourcePackages/checkouts" && pwd -P)"`, where `BUILD_DIR` is
  `<DerivedData>/Build/Products`; the pre-action then invokes
  `"$CHECKOUTS/conciv-swift/Scripts/launch.sh"` with a guard that no-ops when the file is absent.
- Which target supplies the build settings: the scheme's Run action target. Verified requirement: build
  settings (`BUILD_DIR` and friends) are present in a pre-action ONLY when the scheme's pre-action holds
  an `EnvironmentBuildable` reference to the app target ("Provide build settings from" set to the app in
  the UI); the pre-action env is empty of build settings without it. The setup instructions must call
  this out.
- Checkout-root derivation, spike-verified: the `$BUILD_DIR/../../SourcePackages/checkouts` formula holds
  under both default DerivedData and `-derivedDataPath <custom>` (the build settings already reflect the
  custom root). It BREAKS under `-clonedSourcePackagesDirPath`: checkouts move to `<cloned>/checkouts`
  and no build setting exposes that path (confirmed by grepping a full `-showBuildSettings`). That flag
  is uncommon and CI-only; the launcher must fail soft with a clear message telling the user to set an
  explicit override in that case.
- Behavior before package resolution has produced a checkout: the launcher file does not exist yet, so
  the pre-action guard no-ops with a loud log and exits 0; the next build after Xcode resolves packages
  picks it up. Local path dependencies create no checkout either, so the same soft-fail applies.
- How the launcher learns project context: from the pre-action environment (build settings above plus the
  scheme name and destination), passed to `conciv start` as flags.
- The cwd passed to `conciv start`: the project or workspace containing directory (`SRCROOT`), so
  discovery's exact-cwd-container tier resolves the intended project.

Pre-action mechanics, spike-verified (2026-07-26, Xcode 17F113): scheme pre-actions are not sandboxed at
all, even with `ENABLE_USER_SCRIPT_SANDBOXING=YES` (HOME write, detached `nohup` process survival, and
network all worked), which is why the pre-action is the primary mechanism. Two constraints follow: the
pre-action must live in a SHARED scheme (`xcshareddata/xcschemes`) so it runs under `xcodebuild` and is
committable, and pre-action stdout is not surfaced by `xcodebuild`, so the launcher must redirect its own
output to a log file (below). Surprise finding, stated but not relied on: on this Xcode the sandboxed
run-script profile is `(allow default)` with denies only on `SRCROOT`/`PROJECT_DIR`/build dirs (not
`SourcePackages`), so HOME, network, and spawn also work in a sandboxed run-script phase; treat that as
version-specific and keep the run-script phase only as a documented fallback, not the primary path.

**Detached launcher lifecycle.** A genuinely detached server never receives Xcode's termination signal,
so signal cleanup is not the primary path. Define:

- Orphan ownership by a per-bundle pid file plus liveness pruning; a stale entry with a dead pid is
  reclaimable.
- A lock file so two concurrent pre-actions cannot start two servers for the same bundle id.
- Process-group handling for the `npx -> npm -> node -> conciv` tree so a stop reaches the whole tree.
- Log file location: `~/.conciv/logs/<bundleId>.log`.
- A `conciv stop` command (stop-if-mine: stop only the server whose pid file this launcher owns).
- Stale-version replacement: the launcher records the CLI version it started; when `npx` would resolve a
  newer CLI, it stops the old server and restarts, so a paired core is never stuck on an old build.
- Prerequisites missing (no Node, wrong Node, no launcher) exit 0 with a loud log and never break the
  user's build.
- The health check is keyed by bundle id (reads this run's pairing entry, not any healthy core), so one
  project's live server does not suppress another project's startup.

**Mirror assembly.** The launcher script joins `native/swift/ConcivWidget` and the mirror
(`conciv-dev/conciv-swift`) assembly; fixtures test checkout-path derivation and pre-action generation
across the DerivedData variants above.

### P-g: real Xcode/simulator end-to-end

A CLI-booted core plus the real simulator demo app running the consume loop, converting the P-a transport
spike into a permanent automated test over the file-based pairing transport (not `SIMCTL_CHILD_CONCIV_URL`).

### P-h: docs rewrite, last, gated on all previous

Only after every preceding gate passes (including the multi-project discovery fixtures) rewrite the quick
start: add the Swift package, `ConcivWidget.attach()`, paste one pre-action line, press Run. Delete the
override documentation at this point; keep an advanced override accordion for ambiguous-project and
pinned-target cases.

Out of scope throughout: watch/HMR of the user's web code (there is none), a multi-project selection UI,
and physical-device transport (still plan 10).

### M3: later, deliberately unscheduled

Swap the launcher internals to a signed, notarized, self-contained binary (Node-free, so the Node
prerequisite disappears with zero user-visible change), a brew formula, a menu-bar or managed app, and
physical-device transports (plan 10).

Web-host users keep their vite integration untouched: same engine, two front doors.

## Sequencing vs PR #143

#143 merges as-is first (the config block is already an optional accordion there). This plan is the next
PR set on the same 0.0.x line, in the phase order above. Override docs survive until P-h. Nothing in #143
blocks or is blocked by this plan.

## Task breakdown

- [ ] P-a: versioned atomic multi-entry pairing contract keyed by bundle id (schema, locking, pruning,
      cleanup, duplicate behavior). Transport itself is already proven by spike (host file read,
      `/t/<token>/health`, `/t/<token>/native`, prefix-preserving RPC/SSE/WS); its permanent e2e lands in P-g.
      Keep port-probe fallback dead for tokenized cores; Simulator-only, device stays plan 10
- [ ] P-b: implement endpoint collection in core (upsert/prune under lock) and Swift (collection decode,
      select by `Bundle.main.bundleIdentifier`); tests for concurrency, dead-pid, duplicate, version mismatch
- [ ] P-c: discovery model (`xcodebuild -list -json`, explicit `-workspace`/`-project`, per-scheme build
      settings, product-type app-target validation, proximity tiers, `Package.swift` non-goal); absent-config
      activation across tool registration, server context, and system prompt (core change plus tests);
      field-by-field partial-override merge; per-process immutable cache; new simulator resolution
- [ ] P-d: dependency-safe shared boot composition exported from `@conciv/it` (not core, not a new
      package), consumed by both the vite plugin and the CLI; add the CLI's runtime dependencies
- [ ] P-e: `start` subcommand: per-run token, direct port-0 bind with `--port` and conflict diagnostics,
      authenticated per-harness preflight with `--harness` > env > Claude precedence, foreground signal
      cleanup, `--json` versioned readiness schema with exit codes, `--project`/`--simulator-udid` flags,
      prerequisite checks
- [ ] P-f: launcher script and mirror assembly: exact pre-action line and quoting, proven checkout
      formula (`$BUILD_DIR/../../SourcePackages/checkouts`) across default/custom DerivedData with
      soft-fail-plus-override for `-clonedSourcePackagesDirPath`, `EnvironmentBuildable` app-target reference
      requirement, shared-scheme placement, pre-resolution no-op, detached lifecycle (pid file, lock,
      process-group, log redirect, `conciv stop`, stale-version restart, exit-0-on-missing-prereqs,
      bundle-id-keyed health check); fixtures for derivation and pre-action generation
- [ ] P-g: real Xcode/simulator e2e: CLI-booted core plus demo app consume loop, converting the transport
      spike into a permanent automated test over the file-based pairing transport
- [ ] P-h: quick-start rewrite and override-docs deletion, gated on all prior phases and the multi-project
      fixtures; keep an advanced override accordion
