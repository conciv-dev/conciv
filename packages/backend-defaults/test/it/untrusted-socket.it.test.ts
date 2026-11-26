import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'

describe('untrusted socket', () => {
  test('a browser that has not logged in may call only the login procedures, and everything once it logs in', async ({
    createEngine,
    untrusted,
  }) => {
    const engine = await createEngine()
    const rpc = untrusted(engine)

    await expect(rpc.sessions.list({})).rejects.toThrow('this connection is not trusted')
    await expect(rpc.auth.exchange({code: await engine.loginCode()})).resolves.toEqual({token: expect.any(String)})
    await expect(rpc.sessions.list({})).resolves.toMatchObject({sessions: expect.any(Array)})
    await expect(rpc.auth.issueCode()).rejects.toMatchObject({code: 'FORBIDDEN'})
  })
})
