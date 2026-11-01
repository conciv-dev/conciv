# ios/src/server

## Overview

`tools.ts` implements build (in xcodebuild or swiftc mode), simulator resolve, boot, install and launch, screenshot capture, and log retrieval. It also defines the zod output schemas for these tools. `simctl-runner.ts` wraps `child_process.execFile` in a promise that always resolves. `diagnostics.ts` parses `file:line:col: error|warning: msg` lines and removes duplicates. `prompt.ts` builds the system prompt from the overlay rules and the configured project, bundle id, build mode and simulator.

## Interface

- `runBuild` (`tools.ts`): `ios_build` handler that dispatches to the swiftc or xcodebuild build
- `runRun` (`tools.ts`): `ios_run` handler; runs simctl boot, bootstatus, install, terminate and launch
- `runScreenshot` (`tools.ts`): `ios_screenshot` handler; runs `simctl io screenshot --type png -` and returns `imageResult`
- `runLogs` (`tools.ts`): `ios_logs` handler; runs `simctl spawn <udid> log show --style compact --last <n>s`
- `BuildOutputSchema` / `RunOutputSchema` / `LogsOutputSchema` / `ScreenshotOutputSchema` (`tools.ts`): tool output unions, each including a not-configured variant `{ok:false,error}`
- `IosToolContext` / `BuildOutput` / `RunOutput` / `RunFailure` / `LogsOutput` / `LogsFailure` / `NotConfigured` (`tools.ts`): exported types
- `projectDir` (`tools.ts`): uses `projectRoot` as is when it is absolute, otherwise resolves it against cwd
- `parseXcodebuildAppPath` (`tools.ts`): finds the `.app` path in `-showBuildSettings -json` output whose `PRODUCT_BUNDLE_IDENTIFIER` matches the bundle id
- `makeExecRunner` / `SimctlRunner` / `RunResult` (`simctl-runner.ts`): promise wrapper around `execFile`, returning `{code, stdout: Buffer, stderr}`
- `parseDiagnostics` / `DiagnosticSchema` / `Diagnostic` (`diagnostics.ts`): compiler diagnostic parser and schema
- `iosSystemPrompt` (`prompt.ts`): returns the overlay rules plus the grounding rules for the configured project

## Invariants

- `runBuild`/`runRun`/`runScreenshot`/`runLogs` (`tools.ts`): return `NOT_CONFIGURED` ('ios extension not configured') when `ctx.config` is undefined
- `runRun` (`tools.ts`): runs the stages in order resolve-simulator, boot, artifact, install, launch, and a failure returns `RunFailure` naming the stage
- `resolveUdid` (`tools.ts`): skips devices with `isAvailable === false`, matches on udid or name, and picks a `Booted` device before the first match
- `resolveAppPath` (`tools.ts`): returns an error telling the user to run ios_build before ios_run when no `.app` exists
- `buildSwiftc` (`tools.ts`): fails when `Info.plist` is missing at the project root, and stops at the first failing step (sdk path, swiftc, plutil, codesign)
- `reportedDiagnostics` (`tools.ts`): when a command fails without parsed diagnostics, it adds one fallback diagnostic
- `boundedCommandError` (`tools.ts`): keeps only the last 40 lines (`ERROR_TAIL_LINES`) of an error message
- `runLogs` (`tools.ts`): defaults to a 60s window and returns the last `limit` lines, 500 (`DEFAULT_LOG_LINES`) by default
- `pngDimensions` (`tools.ts`): returns 0x0 when the PNG buffer is shorter than 24 bytes
- `MAX_BUFFER` (`simctl-runner.ts`): child output is capped at 128 MiB; a non-numeric error code becomes exit code 1
- `parseDiagnostics` (`diagnostics.ts`): drops duplicate diagnostics that share the same file, line, severity and message

## Side Effects

- `makeExecRunner` (`simctl-runner.ts`): starts child processes with `execFile`, passing `process.env` merged with the per-call env
- `developerEnv` (`tools.ts`): sets env var `DEVELOPER_DIR` to `config.developerDir` or `DEFAULT_DEVELOPER_DIR`
- `launchEnv` (`tools.ts`): sets `SIMCTL_CHILD_CONCIV_URL` (from `concivUrl` or `ctx.nativeUrl()`) and `SIMCTL_CHILD_CONCIV_AUTOSHOW=1` for `simctl launch`
- `buildSwiftc` (`tools.ts`): writes to disk with `rmSync` of `build/<module>.app` on clean, `mkdirSync`, a `PkgInfo` file via `writeFileSync`, plutil writing `Info.plist`, and codesign
- `collectSwiftSources` (`tools.ts`): reads `Sources` and `extraSourceDirs` recursively with `readdirSync` to collect `.swift` files
- `runRun` (`tools.ts`): boots the simulator, installs the app, terminates the app and launches it through `xcrun simctl`

## Verification

- Run: `cd packages/extensions/ios && pnpm test`
