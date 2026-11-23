import {readFile, stat} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe('the ios pairing file', () => {
  test('an engine with the ios plugin writes its own address and pid under ~/.conciv for the Swift SDK, with no token, owner-only', async () => {
    const engine = await createEngine({plugins: ['@conciv/plugin-ios']})
    const file = join(homedir(), '.conciv', 'dev-endpoint.json')

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({apiBase: engine.address.apiBase, pid: process.pid})
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })
})
