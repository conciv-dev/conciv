import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import {createEngine} from '@conciv/plugin-testkit'

describe('asks', () => {
  test('a permission rule that denies the action fails the call and says it is denied', async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/guarded'],
      permission: {'guarded.write': 'deny'},
    })

    const failure = await engine.session.tool('guarded_write').failure({file: 'notes.txt'})

    expect(JSON.parse(failure.message)).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({message: expect.stringContaining('Permission denied: guarded.write')}),
      }),
    )
  })

  test("a tool's fallback ask makes the call wait for approval even when every action is allowed", async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/guarded'], permission: 'allow'})

    const call = engine.session.tool('guarded_read').call({file: 'notes.txt'})
    await engine.session.approve()

    expect(await call).toEqual({read: 'notes.txt'})
  })

  test("a plugin lists, reads and answers the session's pending ask: once lets the call finish, always is saved for that file so the next call does not ask, and reject fails the call", async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/guarded'],
      permission: {'guarded.write': 'ask'},
    })
    const sessionId = engine.session.id
    const asked = z.object({id: z.string()})

    const onceAsk = await engine.event('permission.asked')
    const once = engine.session.tool('guarded_write').call({file: 'notes.txt'})
    const {id: onceId} = asked.parse((await onceAsk.arrived).data)
    const pending = {id: onceId, action: 'guarded.write', resources: ['notes.txt']}
    expect(await engine.rpc.call('asks', 'list', {sessionId})).toEqual([pending])
    expect(await engine.rpc.call('asks', 'get', {sessionId, requestId: onceId})).toEqual(pending)
    expect(await engine.rpc.call('asks', 'reply', {sessionId, requestId: onceId, decision: 'once'})).toEqual({
      replied: true,
    })
    expect(await once).toEqual({written: 'notes.txt'})
    expect(await engine.rpc.call('asks', 'list', {sessionId})).toEqual([])

    const alwaysAsk = await engine.event('permission.asked')
    const always = engine.session.tool('guarded_write').call({file: 'notes.txt'})
    const {id: alwaysId} = asked.parse((await alwaysAsk.arrived).data)
    await engine.rpc.call('asks', 'reply', {sessionId, requestId: alwaysId, decision: 'always'})
    expect(await always).toEqual({written: 'notes.txt'})

    expect(await engine.session.tool('guarded_write').call({file: 'notes.txt'})).toEqual({written: 'notes.txt'})
    expect(await engine.rpc.call('asks', 'list', {sessionId})).toEqual([])

    const rejectAsk = await engine.event('permission.asked')
    const rejected = engine.session.tool('guarded_write').failure({file: 'other.txt'})
    const {id: rejectId} = asked.parse((await rejectAsk.arrived).data)
    await engine.rpc.call('asks', 'reply', {sessionId, requestId: rejectId, decision: 'reject'})
    expect(await rejected).toEqual(expect.objectContaining({tool: 'guarded_write'}))
    expect(await engine.rpc.call('asks', 'list', {sessionId})).toEqual([])
  })
})
