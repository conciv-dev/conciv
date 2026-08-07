import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))

const BANNED = [
  '@conciv/harness',
  '@conciv/claude-connect',
  '@anthropic-ai/claude-agent-sdk',
  '@opencode-ai/sdk',
  '@agentclientprotocol/sdk',
  '@tanstack/ai-sandbox',
  '@tanstack/ai-acp',
  '@tanstack/ai-claude-code',
  '@tanstack/ai-codex',
  '@tanstack/ai-opencode',
]

type Manifest = {name: string; dependencies: Record<string, string>}

function closureEntryDir(entry: unknown): string {
  if (typeof entry !== 'object' || entry === null || !('path' in entry)) {
    throw new Error('pnpm listed a closure entry without a path')
  }
  const {path} = entry
  if (typeof path !== 'string') throw new Error('pnpm listed a closure entry whose path is not a string')
  return path
}

function prodClosureDirs(): string[] {
  const output = execFileSync('pnpm', ['--filter-prod', '@conciv/cli...', 'ls', '--depth', '-1', '--json'], {
    cwd: workspaceRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString()
  const parsed: unknown = JSON.parse(output)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('pnpm reported an empty production closure for @conciv/cli')
  }
  return parsed.map(closureEntryDir)
}

function manifestOf(dir: string): Manifest {
  const raw: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (typeof raw !== 'object' || raw === null || !('name' in raw) || typeof raw.name !== 'string') {
    throw new Error(`invalid manifest at ${dir}`)
  }
  const dependencies =
    'dependencies' in raw && typeof raw.dependencies === 'object' && raw.dependencies !== null
      ? Object.fromEntries(Object.entries(raw.dependencies).map(([name, range]) => [name, String(range)]))
      : {}
  return {name: raw.name, dependencies}
}

test('the CLI production closure carries harness-init but never the harness package or an agent sdk', () => {
  const manifests = prodClosureDirs().map(manifestOf)
  const names = manifests.map((manifest) => manifest.name)
  expect(names).toContain('@conciv/harness-init')
  for (const banned of BANNED) expect(names).not.toContain(banned)
  for (const manifest of manifests) {
    const declared = Object.keys(manifest.dependencies).filter((name) => BANNED.includes(name))
    expect(declared, `${manifest.name} declares a banned production dependency`).toEqual([])
  }
})
