import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'
import {claudeConnectBridgeSource, CLAUDE_CONNECT_BRIDGE_FILE} from './bridge.js'
import {concivEntrySkillMarkdown, CONCIV_ENTRY_SKILL_NAME} from './entry-skill.js'
import {CLAUDE_CONNECT_MARKETPLACE, CLAUDE_CONNECT_MCP_SERVER, CLAUDE_CONNECT_PLUGIN} from './names.js'
import {claudePackSkillFiles, resolvePackSkillsRoot, type PackSkillsResolution} from './pack-skills.js'

export const CLAUDE_CONNECT_ROOT = 'claude-connect'

function readVersionField(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) return null
  const {version} = raw
  return typeof version === 'string' ? version : null
}

function readOwnPackageVersion(): string {
  const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json')
  const version = readVersionField(JSON.parse(readFileSync(manifestPath, 'utf8')))
  if (version === null) throw new Error(`${manifestPath}: missing a string "version" field`)
  return version
}

export const CLAUDE_CONNECT_PLUGIN_VERSION = readOwnPackageVersion()

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

function mcpManifest(): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        [CLAUDE_CONNECT_MCP_SERVER]: {
          type: 'stdio',
          command: 'node',
          args: [`\${CLAUDE_PLUGIN_ROOT}/bin/${CLAUDE_CONNECT_BRIDGE_FILE}`],
        },
      },
    },
    null,
    2,
  )}\n`
}

const BRIDGE_FILE_MODE = 0o700

export function claudeConnectSkillsDir(stateDir: string): string {
  return join(claudeConnectDir(stateDir), CLAUDE_CONNECT_PLUGIN, 'skills')
}

export function claudeConnectPackResolution(opts: {cwd: string}): PackSkillsResolution {
  return resolvePackSkillsRoot(opts.cwd)
}

export function claudeConnectPluginFiles(opts: {stateDir: string; cwd: string}): HarnessConnectFile[] {
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
    {path: join(plugin, '.mcp.json'), contents: mcpManifest()},
    {path: join(plugin, 'skills', CONCIV_ENTRY_SKILL_NAME, 'SKILL.md'), contents: concivEntrySkillMarkdown()},
    ...claudePackSkillFiles(plugin, opts.cwd).files,
  ]
}
