import {describe, it, expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {serveExtensionRpc} from '@conciv/harness-testkit/rpc-mounts'
import {makeExtRpcClient} from '@conciv/extension'
import {makeChildManager} from '../src/runner/driver.js'
import {makeTestRunnerRouter, type TestRunnerRouter} from '../src/server.js'
import {tsxSpawnFor, vitestChildTs, vitestSpec} from './helpers.js'

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')

describe('the test-runner rpc stream over a real vitest run (IT)', () => {
  it('delivers per-test events while the run is still in flight', async () => {
    const manager = makeChildManager(vitestSpec, fixture, {spawnRunner: tsxSpawnFor(vitestChildTs)})
    const served = await serveExtensionRpc({slug: 'test-runner', router: makeTestRunnerRouter(manager)})
    const abort = new AbortController()
    try {
      const client = makeExtRpcClient<TestRunnerRouter>(served.base, 'test-runner')
      const stream = await client.stream(undefined, {signal: abort.signal})
      const progress = {runResolved: false, testsWhileRunning: 0}
      const collecting = (async () => {
        for await (const event of stream) {
          if (event.type === 'test' && !progress.runResolved) progress.testsWhileRunning += 1
          if (event.type === 'run-end') return
        }
      })()
      await client.run({}).finally(() => {
        progress.runResolved = true
      })
      await collecting
      expect(progress.testsWhileRunning).toBeGreaterThan(0)
    } finally {
      abort.abort()
      await manager.stop()
      await served.close()
    }
  }, 60_000)
})
