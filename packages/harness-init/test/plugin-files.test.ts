import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join, relative, sep} from 'node:path'
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

  it('keeps every generated manifest free of dev server urls', () => {
    for (const [path, contents] of treeOf('/first/.conciv')) {
      if (path.includes(`${SKILLS_DIR}${sep}`)) continue
      expect(contents).not.toContain('127.0.0.1')
      expect(contents).not.toContain('http://')
    }
  })
})

const SKILLS_DIR = 'skills'

function skillsSourceDir(): string {
  return join(dirname(createRequire(import.meta.url).resolve('@conciv/skills/package.json')), 'skills')
}

function pluginPaths(): string[] {
  return treeOf('/first/.conciv').map(([path]) => path)
}

describe('claude connect plugin skills', () => {
  it('ships every published conciv skill so claude lists them natively', () => {
    const shipped = pluginPaths().filter((path) => path.includes(`${SKILLS_DIR}${sep}`))

    expect(shipped).toContain(join('conciv-connect', SKILLS_DIR, 'conciv-setup', 'SKILL.md'))
    expect(shipped).toContain(join('conciv-connect', SKILLS_DIR, 'conciv-develop', 'SKILL.md'))
    expect(shipped).toContain(join('conciv-connect', SKILLS_DIR, 'conciv-debug', 'SKILL.md'))
    expect(shipped).toContain(join('conciv-connect', SKILLS_DIR, 'conciv-harness', 'SKILL.md'))
  })

  it('ships the reference files a skill points at, never the authoring artifacts', () => {
    const shipped = pluginPaths().filter((path) => path.includes(`${SKILLS_DIR}${sep}`))

    expect(shipped).toContain(join('conciv-connect', SKILLS_DIR, 'conciv-develop', 'references', 'tool-contract.md'))
    expect(shipped.filter((path) => path.includes('_artifacts'))).toEqual([])
  })

  it('copies skill markdown byte for byte from the published package', () => {
    const shipped = contentsAt('/first/.conciv', join('conciv-connect', SKILLS_DIR, 'conciv-setup', 'SKILL.md'))

    expect(shipped).toBe(readFileSync(join(skillsSourceDir(), 'conciv-setup', 'SKILL.md'), 'utf8'))
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
