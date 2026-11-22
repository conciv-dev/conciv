import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe('start', () => {
  test('a malformed access token is refused at start', async () => {
    await expect(createEngine({}, {port: 'connect', token: 'not-a-uuid'})).rejects.toThrow(
      'conciv: accessToken must be a UUID pairing token',
    )
  })
})

describe('engine logs', () => {
  test("an engine's Effect logs land in the log file in its home once it stops", async () => {
    const engine = await createEngine({}, {fs: {filewatcher: true}})

    await engine.restart()

    expect(readFileSync(join(engine.home, 'log', 'conciv-local.log'), 'utf8')).toMatch(
      /^timestamp=\S+ level=INFO run=\S+ message="watcher started"/m,
    )
  })
})
