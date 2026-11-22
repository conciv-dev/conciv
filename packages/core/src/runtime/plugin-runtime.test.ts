import {cpSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {describe, expect, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe('session events', () => {
  test('a plugin hears each run start and end, runs its idle hook after a completed run, and its instructions reach the model until it takes them back', async () => {
    const engine = await createEngine(
      {plugins: ['./test/fixtures/plugins/run-listener']},
      {harnesses: [{id: 'resuming', sessions: []}]},
    )
    await engine.session.tool('runs_note').call({text: 'Answer in British English'})

    await engine.reply(TestLLM.text('First answer'))
    await engine.session.send('one')
    expect((await engine.requests())[0]?.system.join('\n')).toContain(
      '<context key="house-style">\nAnswer in British English\n</context>',
    )

    await engine.session.tool('runs_forget').call({})
    await engine.reply(TestLLM.failAfter(new Error('the model is down')))
    await expect(engine.session.send('two')).rejects.toThrow('the model is down')
    expect(JSON.stringify((await engine.requests())[1])).toContain(
      'The context under \\"house-style\\" no longer applies. Disregard it.',
    )

    const gate = await engine.gate()
    await engine.reply(TestLLM.text('Never shown'))
    const held = engine.session.send('three')
    await gate.started
    await engine.session.stop()
    await held

    expect(await engine.session.tool('runs_heard').call({})).toEqual({
      heard: [
        'session.execution.started',
        'session.execution.succeeded',
        'idle',
        'session.execution.started',
        'session.execution.failed',
        'session.execution.started',
        'session.execution.interrupted',
      ],
    })
  })
})

describe('live pickup', () => {
  test("a skill added to the project's conciv folder while the engine runs reaches the next request", async () => {
    const engine = await createEngine({}, {fs: {filewatcher: true}})
    await engine.reply(TestLLM.text('First answer'), TestLLM.text('Second answer'))
    await engine.session.send('one')
    expect((await engine.requests())[0]?.system.join('\n')).not.toContain('<name>release-notes</name>')

    const updated = await engine.event('skill.updated')
    cpSync(resolve('test/fixtures/skills/release-notes'), join(engine.root, 'conciv/skills/release-notes'), {
      recursive: true,
    })
    await updated.arrived
    await engine.session.send('two')

    expect(JSON.stringify((await engine.requests())[1])).toContain('<name>release-notes</name>')
  })
})

describe('other engines', () => {
  test('a plugin lists every engine running on the machine on its first read', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/engine-lister']})
    await createEngine({}, {home: engine.home})

    expect(await engine.session.tool('engines_list').call({})).toEqual({
      ids: [expect.any(String), expect.any(String)],
    })
  })
})
