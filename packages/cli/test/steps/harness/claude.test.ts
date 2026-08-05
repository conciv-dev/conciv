import {execFile} from 'node:child_process'
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {delimiter, dirname, join, relative} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'
import {claudeConnectDir, claudeConnectPluginFiles} from '@conciv/harness/claude-connect-files'
import type {HarnessId} from '../../../src/init/harness-detect.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {claudeStep, type ClaudeIo} from '../../../src/init/steps/harness/claude.js'
import {stepContext} from '../framework/step-context.js'

const INSTALL_COMMAND = 'claude plugin install conciv-connect@conciv --scope local'

const LIVE_MCP_URL = 'http://127.0.0.1:5173/api/mcp'

type Fixture = {
  cwd: string
  home: string
  recordFile: string
  harness: ReturnType<typeof stepContext>
  io: ClaudeIo
}

function shimScript(): string {
  return [
    '#!/bin/sh',
    'printf \'%s\\n\' "$*" >> "$CONCIV_CLAUDE_RECORD"',
    '[ "$CONCIV_CLAUDE_EXIT" = "0" ] || exit "$CONCIV_CLAUDE_EXIT"',
    'PLUGINS="$HOME/.claude/plugins"',
    'CACHE="$PLUGINS/cache/conciv/conciv-connect/0.0.0"',
    'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "add" ]; then',
    '  mkdir -p "$PLUGINS"',
    '  printf \'%s\' "$4" > "$PLUGINS/conciv-source"',
    '  printf \'{"conciv":{"installLocation":"%s"}}\' "$4" > "$PLUGINS/known_marketplaces.json"',
    'fi',
    'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then',
    '  ROOT=$(cat "$PLUGINS/conciv-source")',
    '  mkdir -p "$CACHE"',
    '  cp -R "$ROOT/conciv-connect/." "$CACHE/"',
    '  printf \'{"version":2,"plugins":{"conciv-connect@conciv":[{"scope":"local","version":"0.0.0","installPath":"%s","projectPath":"%s"}]}}\' "$CACHE" "$PWD" > "$PLUGINS/installed_plugins.json"',
    'fi',
    'exit 0',
    '',
  ].join('\n')
}

function claudeIo(opts: {home: string; binDir: string; recordFile: string; exitCode: number}): ClaudeIo {
  return {
    home: opts.home,
    run: (bin, args, cwd) =>
      new Promise((settle, reject) => {
        const env = {
          ...process.env,
          PATH: `${opts.binDir}${delimiter}${process.env.PATH ?? ''}`,
          HOME: opts.home,
          CONCIV_CLAUDE_RECORD: opts.recordFile,
          CONCIV_CLAUDE_EXIT: String(opts.exitCode),
        }
        execFile(bin, args, {env, cwd}, (error, stdout, stderr) => {
          if (error === null) {
            settle({code: 0, output: `${stdout}${stderr}`})
            return
          }
          if (typeof error.code !== 'number') {
            reject(error)
            return
          }
          settle({code: error.code, output: `${stdout}${stderr}`})
        })
      }),
  }
}

function fixture(opts: {exitCode: number; cwdPrefix?: string}): Fixture {
  const cwd = mkdtempSync(join(tmpdir(), opts.cwdPrefix ?? 'conciv-claude-step-'))
  const home = mkdtempSync(join(tmpdir(), 'conciv-claude-home-'))
  const binDir = join(home, 'shim-bin')
  const recordFile = join(home, 'claude-argv.log')
  mkdirSync(binDir, {recursive: true})
  const shim = join(binDir, 'claude')
  writeFileSync(shim, shimScript())
  chmodSync(shim, 0o755)
  return {cwd, home, recordFile, harness: stepContext(cwd), io: claudeIo({home, binDir, recordFile, ...opts})}
}

function siblingProject(source: Fixture): Fixture {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-claude-other-'))
  return {...source, cwd, harness: stepContext(cwd)}
}

function pluginCacheDir(home: string): string {
  return join(home, '.claude', 'plugins', 'cache', 'conciv', 'conciv-connect', '0.0.0')
}

function connectFiles(stateDir: string, mcpUrl: string): HarnessConnectFile[] {
  return claudeConnectPluginFiles({stateDir, mcpUrl, hookUrl: ''})
}

function urlFreeFiles(stateDir: string): HarnessConnectFile[] {
  return connectFiles(stateDir, '').filter((file) => !file.path.endsWith('.mcp.json'))
}

function seedInstalled(opts: {home: string; cwd: string; mcpUrl: string}): void {
  const stateDir = join(opts.cwd, '.conciv')
  const marketplaceRoot = claudeConnectDir(stateDir)
  const pluginRoot = join(marketplaceRoot, 'conciv-connect')
  const cache = pluginCacheDir(opts.home)
  for (const file of connectFiles(stateDir, opts.mcpUrl)) {
    const step = relative(pluginRoot, file.path)
    if (step.startsWith('..')) continue
    const target = join(cache, step)
    mkdirSync(dirname(target), {recursive: true})
    writeFileSync(target, file.contents)
  }
  const plugins = join(opts.home, '.claude', 'plugins')
  mkdirSync(plugins, {recursive: true})
  writeFileSync(
    join(plugins, 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'conciv-connect@conciv': [{scope: 'local', version: '0.0.0', installPath: cache, projectPath: opts.cwd}],
      },
    }),
  )
  writeFileSync(join(plugins, 'known_marketplaces.json'), JSON.stringify({conciv: {installLocation: marketplaceRoot}}))
}

function recordedArgv(recordFile: string): string[] {
  if (!existsSync(recordFile)) return []
  return readFileSync(recordFile, 'utf8').trim().split('\n')
}

const claudeConsent: HarnessId[] = ['claude']

describe('claudeStep', () => {
  it('installs the connect plugin through the claude plugin manager with the exact argv sequence', async () => {
    const {cwd, recordFile, harness, io} = fixture({exitCode: 0})
    const step = claudeStep(() => claudeConsent, io)
    expect(step.id).toBe('claude')
    const ledger = await runSteps([step], harness.settings, harness.output)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    const stateDir = join(cwd, '.conciv')
    expect(recordedArgv(recordFile)).toEqual([
      `plugin marketplace add ${claudeConnectDir(stateDir)}`,
      'plugin install conciv-connect@conciv --scope local',
    ])
    for (const file of urlFreeFiles(stateDir)) {
      expect(readFileSync(file.path, 'utf8')).toBe(file.contents)
    }
  })

  it('leaves the mcp manifest to the running dev server instead of baking an empty url', async () => {
    const {cwd, harness, io} = fixture({exitCode: 0})
    const ledger = await runSteps([claudeStep(() => claudeConsent, io)], harness.settings, harness.output)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    const manifest = join(claudeConnectDir(join(cwd, '.conciv')), 'conciv-connect', '.mcp.json')
    expect(existsSync(manifest)).toBe(false)
  })

  it('cards out with the install commands when the claude cli exits non-zero', async () => {
    const {harness, io} = fixture({exitCode: 1})
    const ledger = await runSteps([claudeStep(() => claudeConsent, io)], harness.settings, harness.output)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    const cards = ledger[0]?.cards ?? []
    expect(cards).toHaveLength(1)
    expect(cards[0]?.snippet).toContain(INSTALL_COMMAND)
    expect(ledger[0]?.detail).toContain('claude plugin marketplace add')
  })

  it('quotes the marketplace path in the manual card so a directory with spaces pastes cleanly', async () => {
    const {cwd, harness, io} = fixture({exitCode: 1, cwdPrefix: 'conciv claude spaced '})
    const ledger = await runSteps([claudeStep(() => claudeConsent, io)], harness.settings, harness.output)
    const snippet = ledger[0]?.cards[0]?.snippet ?? ''
    expect(cwd).toContain(' ')
    expect(snippet).toContain(`claude plugin marketplace add '${claudeConnectDir(join(cwd, '.conciv'))}'`)
    expect(harness.ctx.cwd).toBe(cwd)
  })

  it('reports already when this project owns the recorded install', async () => {
    const project = fixture({exitCode: 0})
    seedInstalled({home: project.home, cwd: project.cwd, mcpUrl: ''})
    const ledger = await runSteps(
      [claudeStep(() => claudeConsent, project.io)],
      project.harness.settings,
      project.harness.output,
    )
    expect(ledger.map((entry) => entry.status)).toEqual(['already'])
    expect(existsSync(project.recordFile)).toBe(false)
  })

  it('stays already once a running dev server has rewritten the cached mcp manifest', async () => {
    const project = fixture({exitCode: 0})
    seedInstalled({home: project.home, cwd: project.cwd, mcpUrl: LIVE_MCP_URL})
    const ledger = await runSteps(
      [claudeStep(() => claudeConsent, project.io)],
      project.harness.settings,
      project.harness.output,
    )
    expect(ledger.map((entry) => entry.status)).toEqual(['already'])
    expect(existsSync(project.recordFile)).toBe(false)
  })

  it('installs for a second project even though the first project already installed the plugin', async () => {
    const first = fixture({exitCode: 0})
    const firstLedger = await runSteps(
      [claudeStep(() => claudeConsent, first.io)],
      first.harness.settings,
      first.harness.output,
    )
    expect(firstLedger.map((entry) => entry.status)).toEqual(['done'])
    const second = siblingProject(first)
    const ledger = await runSteps(
      [claudeStep(() => claudeConsent, second.io)],
      second.harness.settings,
      second.harness.output,
    )
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    for (const file of urlFreeFiles(join(second.cwd, '.conciv'))) {
      expect(readFileSync(file.path, 'utf8')).toBe(file.contents)
    }
    expect(recordedArgv(first.recordFile)).toEqual([
      `plugin marketplace add ${claudeConnectDir(join(first.cwd, '.conciv'))}`,
      'plugin install conciv-connect@conciv --scope local',
      `plugin marketplace add ${claudeConnectDir(join(second.cwd, '.conciv'))}`,
      'plugin install conciv-connect@conciv --scope local',
    ])
  })

  it('skips without spawning when claude is not in the consent record', async () => {
    const {recordFile, harness, io} = fixture({exitCode: 0})
    const ledger = await runSteps([claudeStep(() => [], io)], harness.settings, harness.output)
    expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
    expect(ledger[0]?.detail).toBe('not selected')
    expect(existsSync(recordFile)).toBe(false)
  })

  it('skips a deselected claude even when the plugin is already installed for this project', async () => {
    const project = fixture({exitCode: 0})
    seedInstalled({home: project.home, cwd: project.cwd, mcpUrl: ''})
    const ledger = await runSteps([claudeStep(() => [], project.io)], project.harness.settings, project.harness.output)
    expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
    expect(ledger[0]?.detail).toBe('not selected')
    expect(existsSync(project.recordFile)).toBe(false)
  })
})
