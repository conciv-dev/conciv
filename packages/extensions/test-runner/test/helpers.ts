import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import type {ChildRunnerSpec, SpawnRunner} from '../src/runner/driver.js'
import type {RunArgs, TestRunnerManager} from '../src/runner/contract.js'

const require = createRequire(import.meta.url)
const tsxEntry = pathToFileURL(require.resolve('tsx')).href

export const vitestChildTs = new URL('../src/runners/vitest/child.ts', import.meta.url)

export const vitestSpec = {
  id: 'vitest',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: true},
  childUrl: vitestChildTs,
  buildRunArgs: (args, cwd) => {
    const patternArgs = (args.patterns ?? []).flatMap((pattern) => ['--pattern', pattern])
    const nameArgs = args.testNamePattern ? ['--name', args.testNamePattern] : []
    const failedArgs = args.failedOnly ? ['--failed'] : []
    return ['--mode', 'run', '--cwd', cwd, ...patternArgs, ...nameArgs, ...failedArgs]
  },
  buildListArgs: (failedOnly, cwd) => ['--mode', 'list', '--cwd', cwd, ...(failedOnly ? ['--failed'] : [])],
} satisfies ChildRunnerSpec

export function tsxSpawnFor(childTsUrl: URL): SpawnRunner {
  const childTs = fileURLToPath(childTsUrl)
  return (args, cwd) => {
    const env: NodeJS.ProcessEnv = {...process.env}
    delete env.NODE_OPTIONS
    return spawn(process.execPath, ['--import', tsxEntry, childTs, ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
  }
}

export function errorSpawnRunner(reason: string): SpawnRunner {
  const payload = JSON.stringify({type: 'error', reason})
  return () =>
    spawn(process.execPath, ['-e', "require('fs').writeSync(3, process.argv[1] + '\\n')", payload], {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
}

export function silentExitSpawnRunner(exitCode: number): SpawnRunner {
  return () =>
    spawn(process.execPath, ['-e', `process.exit(${exitCode})`], {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
}

export function killedSpawnRunner(signal: NodeJS.Signals): SpawnRunner {
  return () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
    setTimeout(() => child.kill(signal), 50)
    return child
  }
}

export function captureRunError(mgr: TestRunnerManager, args: RunArgs = {}): Promise<unknown> {
  return mgr.run(args).then(
    () => null,
    (e: unknown) => e,
  )
}
