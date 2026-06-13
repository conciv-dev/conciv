import {spawn, type ChildProcess} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import type {SpawnRunner} from '../src/test-runner/vitest/manager.js'

// Spawn seams for the out-of-process vitest runner in ITs. These run the REAL
// vitest-runner-child — just launched via tsx (no build step) — so the tests exercise the
// true child-process path, not a mock.
const require = createRequire(import.meta.url)
const tsxEntry = pathToFileURL(require.resolve('tsx')).href
const childTs = fileURLToPath(new URL('../src/test-runner/vitest/child.ts', import.meta.url))

export function tsxSpawnRunner(args: string[], cwd: string): ChildProcess {
  const env: NodeJS.ProcessEnv = {...process.env}
  delete env.NODE_OPTIONS
  return spawn(process.execPath, ['--import', tsxEntry, childTs, ...args], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  })
}

// A spawn seam whose child immediately emits the out-of-process failure signal (an `error`
// NDJSON message on fd 3, exactly as the real child does when the app's vitest can't init),
// so the manager surfaces a typed VitestUnavailableError — without faking the manager.
export function errorSpawnRunner(reason: string): SpawnRunner {
  const payload = JSON.stringify({type: 'error', reason})
  return () =>
    spawn(process.execPath, ['-e', "require('fs').writeSync(3, process.argv[1] + '\\n')", payload], {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
}
