import {join} from 'node:path'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'
import {claudeConnectBridgeSource, CLAUDE_CONNECT_BRIDGE_FILE, CLAUDE_CONNECT_BRIDGE_URL_VAR} from './connect-bridge.js'
import {CLAUDE_CONNECT_MARKETPLACE, CLAUDE_CONNECT_MCP_SERVER, CLAUDE_CONNECT_PLUGIN} from './connect-names.js'

export const CLAUDE_CONNECT_ROOT = 'claude-connect'

export const CLAUDE_CONNECT_PLUGIN_VERSION = '0.0.0'

export const CLAUDE_CONNECT_INSTALL_TARGET = `${CLAUDE_CONNECT_PLUGIN}@${CLAUDE_CONNECT_MARKETPLACE}`

export function claudeConnectDir(stateDir: string): string {
  return join(stateDir, CLAUDE_CONNECT_ROOT)
}

function marketplaceManifest(): string {
  return `${JSON.stringify(
    {
      name: CLAUDE_CONNECT_MARKETPLACE,
      owner: {name: 'conciv'},
      plugins: [
        {
          name: CLAUDE_CONNECT_PLUGIN,
          source: `./${CLAUDE_CONNECT_PLUGIN}`,
          description: 'Connects a running claude session to the conciv widget.',
        },
      ],
    },
    null,
    2,
  )}\n`
}

function pluginManifest(): string {
  return `${JSON.stringify(
    {
      name: CLAUDE_CONNECT_PLUGIN,
      version: CLAUDE_CONNECT_PLUGIN_VERSION,
      description: 'Connects a running claude session to the conciv widget.',
      author: {name: 'conciv'},
    },
    null,
    2,
  )}\n`
}

function mcpManifest(opts: {mcpUrl: string}): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        [CLAUDE_CONNECT_MCP_SERVER]: {
          type: 'stdio',
          command: 'node',
          args: [`\${CLAUDE_PLUGIN_ROOT}/bin/${CLAUDE_CONNECT_BRIDGE_FILE}`],
          env: {[CLAUDE_CONNECT_BRIDGE_URL_VAR]: opts.mcpUrl},
        },
      },
    },
    null,
    2,
  )}\n`
}

const BRIDGE_FILE_MODE = 0o700

export function claudeConnectPluginFiles(opts: {
  stateDir: string
  mcpUrl: string
  hookUrl: string
}): HarnessConnectFile[] {
  const root = claudeConnectDir(opts.stateDir)
  const plugin = join(root, CLAUDE_CONNECT_PLUGIN)
  return [
    {path: join(root, '.claude-plugin', 'marketplace.json'), contents: marketplaceManifest()},
    {path: join(plugin, '.claude-plugin', 'plugin.json'), contents: pluginManifest()},
    {
      path: join(plugin, 'bin', CLAUDE_CONNECT_BRIDGE_FILE),
      contents: claudeConnectBridgeSource(),
      mode: BRIDGE_FILE_MODE,
    },
    {path: join(plugin, '.mcp.json'), contents: mcpManifest(opts)},
  ]
}
