# @conciv/harness-init

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
