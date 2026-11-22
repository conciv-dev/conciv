import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {screen} from '@solidjs/testing-library'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {mount} from '@conciv/plugin-testkit/browser'

describe('mounting a plugin by its package name', () => {
  test('a window plugin named in mount shows its part in the app', async () => {
    await mount({plugins: [['@conciv/plugin-try-it', {token: '5f1d3c2a-7b8e-4c9d-a0b1-2c3d4e5f6a7b'}]]})

    expect(await screen.findByRole('heading', {name: 'Drive this page with your agent.'})).toBeVisible()
  })

  test('a plugin with an engine part is refused, and the error says where it goes', async () => {
    await expect(mount({plugins: ['@conciv/plugin-ios']})).rejects.toThrow(
      'the plugin @conciv/plugin-ios runs in the engine: give it to createEngine({plugins})',
    )
  })
})

describe('the viewport between tests', () => {
  test('a test that shrinks the viewport to phone width gets it', async () => {
    await page.viewport(375, 800)

    expect([window.innerWidth, window.innerHeight]).toEqual([375, 800])
  })

  test('the next test starts at the configured 1280x800 again, so a wide-page test never runs at phone width', () => {
    expect([window.innerWidth, window.innerHeight]).toEqual([1280, 800])
  })
})

describe('a scripted reply that hangs, in browser mode', () => {
  test('TestLLM.hang() reaches the engine and holds the run open until the session stops it, then the next reply answers', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.hang(), TestLLM.text('After the stop'))
    const gate = await engine.gate()

    const hung = engine.session.send('Wait for it')
    await gate.started
    await gate.release()
    await engine.session.stop()
    await hung

    await expect(engine.session.send('Go on')).resolves.toBeUndefined()
  })
})

describe('waiting for an engine event that matches, in browser mode', () => {
  test('the data to match crosses to the engine, which passes over an earlier event and resolves with the one that matches', async () => {
    const engine = await createEngine()
    const other = await engine.newSession('Other')
    const wait = await engine.event('session.execution.succeeded', {data: {sessionID: other.id}})
    await engine.reply(TestLLM.text('First'), TestLLM.text('Second'))

    await engine.session.send('In the first session')
    await other.send('In the other session')

    expect(await wait.arrived).toEqual({type: 'session.execution.succeeded', data: {sessionID: other.id}})
  })
})
