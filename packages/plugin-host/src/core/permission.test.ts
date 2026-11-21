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

  test('an ask rule makes the call wait until the user approves once', async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/guarded'],
      permission: {'guarded.write': 'ask'},
    })

    const call = engine.session.tool('guarded_write').call({file: 'notes.txt'})
    await engine.session.approve()

    expect(await call).toEqual({written: 'notes.txt'})
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

  test("an agent's rule denies a tool for that agent's sessions only", async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/guarded', './test/fixtures/plugins/reviewer-agent'],
    })
    const reviewing = await engine.newSession('Review')

    expect(await reviewing.tool('become_reviewer').call({})).toEqual({agent: 'reviewer'})
    const failure = await reviewing.tool('guarded_write').failure({file: 'notes.txt'})

    expect(JSON.parse(failure.message)).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({message: expect.stringContaining('Permission denied: guarded.write')}),
      }),
    )
    expect(await engine.session.tool('guarded_write').call({file: 'notes.txt'})).toEqual({written: 'notes.txt'})
  })
})
