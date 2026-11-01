# @conciv/harness-init

## 0.0.21

### Patch Changes

- [#650](https://github.com/conciv-dev/conciv/pull/650) [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee) Thanks [@omridevk](https://github.com/omridevk)! - New built-in design extension, mounted by `@conciv/it`: register a design image as the target of a route at a width, then `conciv tools design diff` compares the live page with it and ranks the components that differ, with the deltas and the source that sets them. `conciv tools design status` says when every registered width matches. The agent guide written by `conciv init` describes the loop.

- [#621](https://github.com/conciv-dev/conciv/pull/621) [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95) Thanks [@omridevk](https://github.com/omridevk)! - New page capability `page_hmr` (`conciv tools page hmr`): after editing a file, wait until Vite's hot update has been applied in the browser before reading the page. `server reload` now waits on it as well and reports `applied` and `waitedMs`.

  `conciv init` adds a `CLAUDE.md` containing `@AGENTS.md` when the claude harness is chosen and no `CLAUDE.md` exists yet, can now wire vite configs written as a function (`defineConfig(() => ({...}))`, async functions, function bodies with a single return), and prints every command as `.conciv/bin/conciv ...` so it runs as written without `conciv` on PATH.

  The core dev server writes `.conciv/mcp-endpoint.json` when it boots, so the claude stdio MCP bridge works in headless runs.

- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c)]:
  - @conciv/protocol@0.0.21

## 0.0.20

### Patch Changes

- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/protocol@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- [#274](https://github.com/conciv-dev/conciv/pull/274) [`83272f7`](https://github.com/conciv-dev/conciv/commit/83272f77e201bfb76b958243f90d0ba884de844d) Thanks [@omridevk](https://github.com/omridevk)! - conciv init walks per-harness init contributions from the new @conciv/harness-init package: every harness declares detection and install work on its adapter contract, gemini-cli is detected like its siblings, and @conciv/claude-connect dissolves into the claude contribution.

- [#270](https://github.com/conciv-dev/conciv/pull/270) [`d019477`](https://github.com/conciv-dev/conciv/commit/d0194773d25aa4656a20e77f3e63049f351e43e5) Thanks [@omridevk](https://github.com/omridevk)! - Fix the claude connect bridge walking past a nested project's `.conciv` directory when it has no
  `mcp-endpoint.json`, which let a worktree or sub-project with no running dev server silently bridge
  to a parent project's server. The walk now stops at the first ancestor directory that contains a
  `.conciv` directory: if that directory has a valid endpoint file it is used, otherwise the bridge
  fails naming that directory instead of continuing upward.

- [#266](https://github.com/conciv-dev/conciv/pull/266) [`0f4bb5e`](https://github.com/conciv-dev/conciv/commit/0f4bb5e713f5e09006f43bb951782b2a6ad853a0) Thanks [@omridevk](https://github.com/omridevk)! - Resolve the conciv dev server inside the claude connect bridge at request time instead of baking its
  URL into the plugin manifest. Claude caches the plugin once per version under a path with no project
  component, so two projects on one machine used to overwrite each other's cached `.mcp.json` and
  sessions bridged to the wrong project's server. The generated plugin is now byte-identical for every
  project, and each attach writes `.conciv/mcp-endpoint.json` next to the plugin tree; the bridge walks
  up from its working directory, reads that file per request, and fails with the directory it searched
  when no dev server is recorded. A dev server that restarts on a new port is picked up without a
  plugin reinstall, and a marketplace registered by another project no longer triggers reinstall
  ping-pong.

- [#215](https://github.com/conciv-dev/conciv/pull/215) [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8) Thanks [@omridevk](https://github.com/omridevk)! - Every harness now declares init as a capability (`'files' | 'none'`), backed by a per-harness init
  contribution in the new dependency-light `@conciv/harness-init` package, which replaces
  `@conciv/claude-connect`. The `conciv` CLI derives detection and install steps from those
  contributions instead of a hand-listed marker table, and no longer depends on `@conciv/harness`, so
  `npx @conciv/cli@latest init` stops installing every runtime agent SDK. This also makes gemini-cli
  detectable and initializable like its sibling harnesses. `@conciv/harness` consumes
  `@conciv/harness-init` for its own harness contributions; the old `./claude-connect-files` and
  `./claude-connect-state` subpaths are gone.
- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18
