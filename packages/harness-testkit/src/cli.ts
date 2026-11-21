import {spawn} from 'node:child_process'
import {mkdirSync, mkdtempSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {constants, tmpdir} from 'node:os'
import {join} from 'node:path'
import {isolatedEnv} from './isolated-env.js'

const CLI_DEADLINE_MS = 60_000

export type CliOptions = {cwd?: string; env?: Record<string, string>}

export type CliRun = {stdout: string; stderr: string; exitCode: number}

function exitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code
  return 128 + (signal === null ? 0 : constants.signals[signal])
}

function runChild(args: string[], options: CliOptions, home: string): Promise<CliRun> {
  const temporary = join(home, 'tmp')
  mkdirSync(temporary, {recursive: true})
  const bin = createRequire(import.meta.url).resolve('@conciv/cli/bin')
  const child = spawn(process.execPath, [bin, ...args], {
    cwd: options.cwd ?? home,
    env: {...isolatedEnv(process.env, home, temporary), ...options.env},
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: AbortSignal.timeout(CLI_DEADLINE_MS),
  })
  const stdout: string[] = []
  const stderr: string[] = []
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => stdout.push(chunk))
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => stderr.push(chunk))
  const failure: {error?: Error} = {}
  const {promise, resolve, reject} = Promise.withResolvers<CliRun>()
  child.on('error', (error) => {
    failure.error =
      error.name === 'AbortError'
        ? new Error(`the conciv CLI gave no result within ${CLI_DEADLINE_MS}ms`, {cause: error})
        : error
  })
  child.on('close', (code, signal) => {
    if (failure.error !== undefined) reject(failure.error)
    else resolve({stdout: stdout.join(''), stderr: stderr.join(''), exitCode: exitCode(code, signal)})
  })
  return promise
}

export async function cli(args: string[], options: CliOptions = {}): Promise<CliRun> {
  // oxlint-disable-next-line conciv/no-hand-made-temp-dir -- the CLI call's own home, as opencode's cli test helper: removed in the finally below
  const home = mkdtempSync(join(tmpdir(), 'conciv-cli-'))
  try {
    return await runChild(args, options, home)
  } finally {
    await rm(home, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  }
}
