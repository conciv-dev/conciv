import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {test} from '../test/engine.js'
import {makeBrowserRpcClient, makeRpcClient} from '@conciv/contract'

describe('start', () => {
  test('a malformed access token is refused at start', async ({createEngine}) => {
    await expect(createEngine({}, {port: 'connect', token: 'not-a-uuid'})).rejects.toThrow(
      'conciv: accessToken must be a UUID pairing token',
    )

    const engine = await createEngine()
    const {apiBase, token} = engine.address
    await expect(makeRpcClient(apiBase, {token}).meta.harnesses()).resolves.toMatchObject({
      harnesses: expect.any(Array),
    })
    expect(await makeRpcClient(apiBase, {token}).auth.issueCode()).toEqual({
      code: expect.any(String),
      expiresAt: expect.any(Number),
    })
    const socket = makeBrowserRpcClient(apiBase, {token})
    try {
      await expect(socket.rpc.meta.harnesses()).resolves.toMatchObject({harnesses: expect.any(Array)})
      expect(await socket.rpc.auth.issueCode()).toEqual({code: expect.any(String), expiresAt: expect.any(Number)})
    } finally {
      socket.close()
    }
    const legacyPath = await fetch(new URL(`/t/${token}/rpc/meta/harnesses`, apiBase), {method: 'POST'})
    expect(legacyPath.status).toBe(401)
    const bearer = await fetch(new URL('/rpc/meta/harnesses', apiBase), {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`},
    })
    expect(bearer.status).toBe(401)
  })
})

describe('engine logs', () => {
  test("an engine's Effect logs land in the log file in its home once it stops", async ({createEngine}) => {
    const engine = await createEngine({}, {fs: {filewatcher: true}})

    await engine.restart()

    expect(readFileSync(join(engine.home, 'log', 'conciv-local.log'), 'utf8')).toMatch(
      /^timestamp=\S+ level=INFO run=\S+ message="watcher started"/m,
    )
  })
})
