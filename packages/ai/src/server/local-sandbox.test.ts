import {once} from 'node:events'
import {join} from 'node:path'
import {createInterface} from 'node:readline'
import {pathToFileURL} from 'node:url'
import {describe, expect} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {running, test} from '../../test/ai-test.js'

describe('the local sandbox', () => {
  test('kills every agent process group still running when the engine process exits without stopping it', async ({
    groups,
    runNode,
  }) => {
    const sandboxModule = pathToFileURL(join(import.meta.dirname, 'local-sandbox.ts')).href
    const program = [
      `import {localSandbox} from ${JSON.stringify(sandboxModule)}`,
      'const sandbox = await localSandbox({dir: process.cwd()}).create({})',
      "const agent = await sandbox.process.spawn('sleep 600')",
      'console.log(agent.pid)',
      'process.exit(0)',
    ].join('\n')
    const engine = runNode(program, tempDir('sandbox-exit-'))
    const exited = once(engine, 'exit')
    const [line] = await once(createInterface({input: engine.stdout}), 'line')
    const agent = Number(line)
    groups.push(agent)

    await exited

    expect(agent).toBeGreaterThan(0)
    expect(running(agent)).toBe(false)
  })
})
