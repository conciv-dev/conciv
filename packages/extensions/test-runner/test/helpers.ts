import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import type {SpawnRunner} from '../src/runner/driver.js'

// ITs run the REAL adapter child via tsx (no build step) so they exercise the true
// child-process path. tsxSpawnFor(childTsUrl) returns a SpawnRunner bound to that child.
const require = createRequire(import.meta.url)
const tsxEntry = pathToFileURL(require.resolve('tsx')).href

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

// Spawn seam whose child immediately emits the out-of-process failure signal (an `error` NDJSON
// message on fd 3, exactly as a real child does when the app's runner can't init), so the driver
// surfaces a typed RunnerUnavailableError — without faking the manager.
export function errorSpawnRunner(reason: string): SpawnRunner {
  const payload = JSON.stringify({type: 'error', reason})
  return () =>
    spawn(process.execPath, ['-e', "require('fs').writeSync(3, process.argv[1] + '\\n')", payload], {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
}
