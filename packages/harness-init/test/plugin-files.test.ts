import {join, relative} from 'node:path'
import {describe, expect, it} from 'vitest'
import {CLAUDE_CONNECT_BRIDGE_FILE} from '../src/claude/bridge.js'
import {claudeConnectEndpointFile, claudeConnectEndpointPath} from '../src/claude/endpoint.js'
import {inside} from '../src/paths.js'
import {claudeConnectDir, claudeConnectPluginFiles} from '../src/claude/plugin-files.js'

const FIRST_URL = 'http://127.0.0.1:4242/api/mcp'
const SECOND_URL = 'http://127.0.0.1:5173/api/mcp'

function treeOf(stateDir: string): Array<[string, string]> {
  const root = claudeConnectDir(stateDir)
  return claudeConnectPluginFiles({stateDir}).map((file) => [relative(root, file.path), file.contents])
}

function contentsAt(stateDir: string, step: string): string {
  const root = claudeConnectDir(stateDir)
  const file = claudeConnectPluginFiles({stateDir}).find((candidate) => candidate.path === join(root, step))
  if (!file) throw new Error(`no generated file at ${step}`)
  return file.contents
}

describe('claude connect plugin files', () => {
  it('generates the same bytes for every project so one shared plugin cache serves them all', () => {
    expect(treeOf('/first/.conciv')).toEqual(treeOf('/second/.conciv'))
  })

  it('points the mcp manifest at the bridge without naming any dev server', () => {
    const manifest = JSON.parse(contentsAt('/first/.conciv', join('conciv-connect', '.mcp.json')))

    expect(manifest).toEqual({
      mcpServers: {
        conciv: {
          type: 'stdio',
          command: 'node',
          args: [`\${CLAUDE_PLUGIN_ROOT}/bin/${CLAUDE_CONNECT_BRIDGE_FILE}`],
        },
      },
    })
  })

  it('ships a conciv skill whose frontmatter names it and whose body ranks the cli above a browser mcp', () => {
    const skill = contentsAt('/first/.conciv', join('conciv-connect', 'skills', 'conciv', 'SKILL.md'))
    const [, frontmatter = '', body = ''] = skill.split('---\n')

    expect(skill.startsWith('---\n')).toBe(true)
    expect(frontmatter).toMatch(/^name: conciv$/m)
    expect(frontmatter).toMatch(/^description: \S.*browser.*$/m)
    expect(body.trimStart().startsWith('This project has conciv installed.')).toBe(true)
    expect(body).toContain('Use browser MCP tools only when a conciv command cannot do what you need.')
    expect(body).toContain('### When to use conciv instead of the browser MCP')
    expect(body).toContain('`.conciv/bin/conciv tools react locate <selector>`')
    expect(body).toContain('`.conciv/bin/conciv tools server graph|transform|reload`')
    expect(body).not.toMatch(/`conciv /)
  })

  it('keeps every generated file free of dev server urls', () => {
    for (const [, contents] of treeOf('/first/.conciv')) {
      expect(contents).not.toContain('127.0.0.1')
      expect(contents).not.toContain('http://')
    }
  })
})

describe('claude connect endpoint file', () => {
  it('records the dev server url outside the plugin tree that claude copies into its cache', () => {
    const stateDir = '/first/.conciv'
    const file = claudeConnectEndpointFile({stateDir, mcpUrl: FIRST_URL})

    expect(file.path).toBe(claudeConnectEndpointPath(stateDir))
    expect(inside(claudeConnectDir(stateDir), file.path)).toBe(false)
    expect(JSON.parse(file.contents)).toEqual({mcpUrl: FIRST_URL})
  })

  it('gives each project its own endpoint file', () => {
    const first = claudeConnectEndpointFile({stateDir: '/first/.conciv', mcpUrl: FIRST_URL})
    const second = claudeConnectEndpointFile({stateDir: '/second/.conciv', mcpUrl: SECOND_URL})

    expect(first.path).not.toBe(second.path)
    expect(JSON.parse(second.contents)).toEqual({mcpUrl: SECOND_URL})
  })
})
