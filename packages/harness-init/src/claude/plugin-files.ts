import {join} from 'node:path'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'
import {CONCIV_COMMAND_GUIDE, CONCIV_RANKING_SENTENCE, DESIGN_BULLET} from '../agent-guide.js'
import {claudeConnectBridgeSource, CLAUDE_CONNECT_BRIDGE_FILE} from './bridge.js'
import {CLAUDE_CONNECT_MARKETPLACE, CLAUDE_CONNECT_MCP_SERVER, CLAUDE_CONNECT_PLUGIN} from './names.js'

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

const SKILL_DESCRIPTION =
  'Use for anything about the running app in the browser, before any browser MCP tool. Why a page looks or behaves wrong, which React component rendered an element and its source line, live props and state, stale or cached data, elements that cannot be clicked, console errors, re-renders, and the Vite module graph.'

function skillFile(): string {
  return [
    '---',
    'name: conciv',
    `description: ${SKILL_DESCRIPTION}`,
    '---',
    '',
    CONCIV_RANKING_SENTENCE,
    '',
    CONCIV_COMMAND_GUIDE,
    '',
  ].join('\n')
}

const DESIGN_SKILL_DESCRIPTION =
  'Use when the user hands over a design image and asks to build a page from it or make a page match it, such as a PNG mockup, a screenshot of a design or a Figma export. Registers the image as the design target and drives the conciv design diff loop until it stops.'

const DESIGN_SKILL_SOURCES = [
  'packages/extensions/design/src/shared/defs.ts',
  'packages/extensions/design/src/server/differ.ts',
  'packages/extensions/design/src/server/store.ts',
  'packages/harness-init/src/agent-guide.ts',
]

export function designSkillFile(): string {
  return [
    '---',
    'name: conciv-design',
    `description: ${DESIGN_SKILL_DESCRIPTION}`,
    'metadata:',
    "  package: '@conciv/skills'",
    '---',
    '',
    '# Building a page from a design image',
    '',
    DESIGN_BULLET,
    '',
    '## Sources',
    '',
    ...DESIGN_SKILL_SOURCES.map((source) => `- \`${source}\``),
    '',
  ].join('\n')
}

const BRIDGE_FILE_MODE = 0o700

export function claudeConnectPluginFiles(opts: {stateDir: string}): HarnessConnectFile[] {
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
    {path: join(plugin, 'skills', 'conciv', 'SKILL.md'), contents: skillFile()},
  ]
}
