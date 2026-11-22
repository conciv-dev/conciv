import {once} from 'node:events'
import {text} from 'node:stream/consumers'
import {describe, expect} from 'vitest'
import {readLine, test} from '../../test/unplugin-test.js'

describe('the shutdown deadline', () => {
  test('exits 1 when the close outlives the deadline after Ctrl+C, and names what is still pending', async ({hang}) => {
    const {engine, lines} = hang(200)
    await readLine(lines, 'SHUTDOWN_READY')
    const exited = once(engine, 'exit')
    const stderr = text(engine.stderr)

    engine.kill('SIGINT')

    expect(await stderr).toContain('shutdown did not finish within 200ms; exiting. Still pending:')
    expect(await stderr).toContain('conciv engine stopping')
    expect(await exited).toEqual([1, null])
  })

  test('a second Ctrl+C during the close reports and exits without waiting for the deadline', async ({hang}) => {
    const {engine, lines} = hang(5_000)
    await readLine(lines, 'SHUTDOWN_READY')
    const exited = once(engine, 'exit')
    const stderr = text(engine.stderr)

    engine.kill('SIGINT')
    await readLine(lines, 'SIGTERM_SEEN')
    engine.kill('SIGINT')

    expect(await stderr).toContain('received SIGINT again during shutdown; exiting. Still pending:')
    expect(await stderr).toContain('conciv engine stopping')
    expect(await exited).toEqual([1, null])
  })
})
