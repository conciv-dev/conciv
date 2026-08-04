import {execFile} from 'node:child_process'
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {delimiter, join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {claudeConnectDir, claudeConnectPluginFiles} from '@conciv/harness/claude-connect-files'
import type {HarnessId} from '../../../src/init/harness-detect.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {claudeStep, type ClaudeIo} from '../../../src/init/steps/harness/claude.js'
import {stepContext} from '../framework/step-context.js'

const INSTALL_COMMAND = 'claude plugin install conciv-connect@conciv --scope local'

const INSTALLED_STATE = `${JSON.stringify(
  {
    version: 2,
    plugins: {'conciv-connect@conciv': [{scope: 'local', installPath: '/cache', version: '0.0.0'}]},
  },
  null,
  2,
)}\n`

type Fixture = {
  cwd: string
  home: string
  recordFile: string
  ctx: ReturnType<typeof stepContext>['ctx']
  io: ClaudeIo
}

function shimScript(exitCode: number): string {
  return [
    '#!/bin/sh',
    'printf \'%s\\n\' "$*" >> "$CONCIV_CLAUDE_RECORD"',
    'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then',
    '  mkdir -p "$HOME/.claude/plugins"',
    `  printf '%s' '${JSON.stringify({version: 2, plugins: {'conciv-connect@conciv': [{scope: 'local'}]}})}' > "$HOME/.claude/plugins/installed_plugins.json"`,
    'fi',
    `exit ${exitCode}`,
    '',
  ].join('\n')
}

function fixture(opts: {exitCode: number}): Fixture {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-claude-step-'))
  const home = mkdtempSync(join(tmpdir(), 'conciv-claude-home-'))
  const binDir = join(home, 'shim-bin')
  const recordFile = join(home, 'claude-argv.log')
  mkdirSync(binDir, {recursive: true})
  const shim = join(binDir, 'claude')
  writeFileSync(shim, shimScript(opts.exitCode))
  chmodSync(shim, 0o755)
  const io: ClaudeIo = {
    home,
    run: (bin, args) =>
      new Promise((settle, reject) => {
        const env = {
          ...process.env,
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
          HOME: home,
          CONCIV_CLAUDE_RECORD: recordFile,
        }
        execFile(bin, args, {env}, (error, stdout, stderr) => {
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
  return {cwd, home, recordFile, ctx: stepContext(cwd).ctx, io}
}

function recordedArgv(recordFile: string): string[] {
  if (!existsSync(recordFile)) return []
  return readFileSync(recordFile, 'utf8').trim().split('\n')
}

const claudeConsent: HarnessId[] = ['claude']

describe('claudeStep', () => {
  it('installs the connect plugin through the claude plugin manager with the exact argv sequence', async () => {
    const {cwd, recordFile, ctx, io} = fixture({exitCode: 0})
    const step = claudeStep(() => claudeConsent, io)
    expect(step.id).toBe('claude')
    const ledger = await runSteps([step], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    const stateDir = join(cwd, '.conciv')
    expect(recordedArgv(recordFile)).toEqual([
      `plugin marketplace add ${claudeConnectDir(stateDir)}`,
      'plugin install conciv-connect@conciv --scope local',
    ])
    for (const file of claudeConnectPluginFiles({stateDir, mcpUrl: '', hookUrl: ''})) {
      expect(readFileSync(file.path, 'utf8')).toBe(file.contents)
    }
  })

  it('cards out with the install commands when the claude cli exits non-zero', async () => {
    const {ctx, io} = fixture({exitCode: 1})
    const ledger = await runSteps([claudeStep(() => claudeConsent, io)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    const cards = ledger[0]?.cards ?? []
    expect(cards).toHaveLength(1)
    expect(cards[0]?.snippet).toContain(INSTALL_COMMAND)
    expect(ledger[0]?.detail).toContain('claude plugin marketplace add')
  })

  it('reports already from installed_plugins.json without spawning anything', async () => {
    const {home, recordFile, ctx, io} = fixture({exitCode: 0})
    mkdirSync(join(home, '.claude', 'plugins'), {recursive: true})
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), INSTALLED_STATE)
    const ledger = await runSteps([claudeStep(() => claudeConsent, io)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['already'])
    expect(existsSync(recordFile)).toBe(false)
  })

  it('skips without spawning when claude is not in the consent record', async () => {
    const {recordFile, ctx, io} = fixture({exitCode: 0})
    const ledger = await runSteps([claudeStep(() => [], io)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
    expect(ledger[0]?.detail).toBe('not selected')
    expect(existsSync(recordFile)).toBe(false)
  })
})
