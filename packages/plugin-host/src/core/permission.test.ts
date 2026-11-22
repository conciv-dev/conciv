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

  test("a plugin lists, reads and answers the session's pending ask", async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/guarded'],
      permission: {'guarded.write': 'ask'},
    })
    const sessionId = engine.session.id
    const asked = await engine.event('permission.asked')

    const call = engine.session.tool('guarded_write').call({file: 'notes.txt'})
    const {id} = z.object({id: z.string()}).parse((await asked.arrived).data)

    const pending = {id, action: 'guarded.write', resources: ['notes.txt']}
    expect(await engine.rpc.call('asks', 'list', {sessionId})).toEqual([pending])
    expect(await engine.rpc.call('asks', 'get', {sessionId, requestId: id})).toEqual(pending)
    expect(await engine.rpc.call('asks', 'reply', {sessionId, requestId: id, decision: 'once'})).toEqual({
      replied: true,
    })
    expect(await call).toEqual({written: 'notes.txt'})
    expect(await engine.rpc.call('asks', 'list', {sessionId})).toEqual([])
  })

  test('an ask answered always is saved for that file, so the next call does not ask, and an ask answered reject fails the call', async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/guarded'],
      permission: {'guarded.write': 'ask'},
    })
    const sessionId = engine.session.id
    const asked = z.object({id: z.string()})

    const firstAsk = await engine.event('permission.asked')
    const first = engine.session.tool('guarded_write').call({file: 'notes.txt'})
    const {id: firstId} = asked.parse((await firstAsk.arrived).data)
    await engine.rpc.call('asks', 'reply', {sessionId, requestId: firstId, decision: 'always'})
    expect(await first).toEqual({written: 'notes.txt'})

    expect(await engine.session.tool('guarded_write').call({file: 'notes.txt'})).toEqual({written: 'notes.txt'})
    expect(await engine.rpc.call('asks', 'list', {sessionId})).toEqual([])

    const secondAsk = await engine.event('permission.asked')
    const rejected = engine.session.tool('guarded_write').failure({file: 'other.txt'})
    const {id: secondId} = asked.parse((await secondAsk.arrived).data)
    await engine.rpc.call('asks', 'reply', {sessionId, requestId: secondId, decision: 'reject'})
    expect(await rejected).toEqual(expect.objectContaining({tool: 'guarded_write'}))
    expect(await engine.rpc.call('asks', 'list', {sessionId})).toEqual([])
  })
})
