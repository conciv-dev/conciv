# harness-init/src/claude

## Overview

Claude-specific init. It generates a local Claude plugin marketplace under `<stateDir>/claude-connect` (marketplace manifest, plugin manifest, a stdio MCP bridge script, `.mcp.json` and a conciv skill), plans the `claude plugin` CLI install commands, and checks whether the install in the Claude config dir matches the generated files. The bridge forwards stdio JSON-RPC to the dev server's MCP URL, read from `<stateDir>/mcp-endpoint.json`.

## Interface

- `claudeInit` (`init.ts`, export `./claude`): `HarnessInit<'claude'>` with detection `{bin: 'claude', configDir: ['.claude']}`, `init: 'files'`, and `plan`, `installed`, `manualCard`.
- `CLAUDE_CONNECT_MARKETPLACE` = `'conciv'`, `CLAUDE_CONNECT_PLUGIN` = `'conciv-connect'`, `CLAUDE_CONNECT_MCP_SERVER` = `'conciv'` (`names.ts`, export `./claude/names`).
- `CLAUDE_CONNECT_ROOT` = `'claude-connect'`, `CLAUDE_CONNECT_PLUGIN_VERSION` = `'0.0.0'`, `CLAUDE_CONNECT_INSTALL_TARGET` = `'conciv-connect@conciv'`, `claudeConnectDir(stateDir)`, `claudeConnectPluginFiles({stateDir})` (`plugin-files.ts`, export `./claude/files`): files `.claude-plugin/marketplace.json`, `conciv-connect/.claude-plugin/plugin.json`, `conciv-connect/bin/conciv-mcp-bridge.mjs` (mode `0o700`), `conciv-connect/.mcp.json` (stdio `node ${CLAUDE_PLUGIN_ROOT}/bin/conciv-mcp-bridge.mjs`), `conciv-connect/skills/conciv/SKILL.md`.
- `CLAUDE_CONNECT_BRIDGE_FILE` = `'conciv-mcp-bridge.mjs'`, `CLAUDE_CONNECT_BRIDGE_TIMEOUT_VAR` = `'CONCIV_MCP_TIMEOUT_MS'`, `claudeConnectBridgeSource()` (`bridge.ts`, export `./claude/bridge`).
- `CLAUDE_CONNECT_ENDPOINT_FILE` = `'mcp-endpoint.json'`, `claudeConnectEndpointPath(stateDir)`, `claudeConnectEndpointFile({stateDir, mcpUrl})` (`endpoint.ts`, export `./claude/endpoint`).
- `claudeConfigDir({home, override})`, `claudePluginCacheDir(configDir)` (`<configDir>/plugins/cache/conciv/conciv-connect/0.0.0`), `claudeInstallRecords(configDir)`, `claudeConnectServesProject(state)`, types `ClaudeInstallRecord`, `ClaudeConnectInstallState` (`install-state.ts`, export `./claude/state`).

## Invariants

- The install plan runs `claude plugin marketplace add <root>` and then `claude plugin install conciv-connect@conciv --scope local` (`installCommands`, `INSTALL_ARGS`, `init.ts`).
- `installed` requires all three: the `known_marketplaces.json` entry `conciv` points at files equal to the generated ones; an `installed_plugins.json` record has scope `local`, `projectPath` same as the project cwd and `installPath` same as the cache dir; the cached files equal the generated plugin files (`claudeConnectServesProject`, `recordCoversProject`, `copyMatches`).
- `copyMatches` returns false when no generated file lies inside the source root (`install-state.ts`).
- `InstalledPluginsSchema`, `KnownMarketplacesSchema`, `MarketplaceEntrySchema` are zod-validated; a missing or invalid file counts as not installed.
- The bridge walks up from `process.cwd()` to the first dir containing `CONCIV_STATE_DIR`; a missing endpoint file or empty `mcpUrl` returns JSON-RPC error `-32000` `conciv bridge: ...` for requests with an id, and nothing for notifications (`endpoint`, `failed` in `bridge.ts`).
- Bridge timeout is `CONCIV_MCP_TIMEOUT_MS` when finite and > 0, else 180000 (`timeoutMs`); non-ok HTTP, empty bodies and non-JSON frames are errors; `text/event-stream` bodies are split into `data:` frames (`send`, `framesOf`, `eventsOf`).
- `shellQuoted` single-quote-escapes the root in the manual-install snippet (`init.ts`).

## Side Effects

- Reads env `CLAUDE_CONFIG_DIR` (`claudeInit.installed`).
- Reads `<configDir>/plugins/installed_plugins.json`, `known_marketplaces.json` and cached plugin files (`readTextOrNull`, `install-state.ts`).
- This package returns the plugin files and install commands; the caller writes the files and spawns `claude plugin ...` (`installPlan`, `init.ts`).
- The generated bridge script, at runtime, reads env `CLAUDE_CODE_SESSION_ID` and `CONCIV_MCP_TIMEOUT_MS`, reads `<CONCIV_STATE_DIR>/mcp-endpoint.json`, POSTs each stdin line to `mcpUrl` with header `CONCIV_CLAUDE_SESSION_HEADER`, and writes JSON-RPC replies to stdout (`bridge.ts`).

## Verification

- Run: `cd packages/harness-init && pnpm test`
