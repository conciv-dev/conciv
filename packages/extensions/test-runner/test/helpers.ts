import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import type {SpawnRunner} from '../src/runner/driver.js'

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

export function errorSpawnRunner(reason: string): SpawnRunner {
  const payload = JSON.stringify({type: 'error', reason})
  return () =>
    spawn(process.execPath, ['-e', "require('fs').writeSync(3, process.argv[1] + '\\n')", payload], {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
}
