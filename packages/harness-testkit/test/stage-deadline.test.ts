import {existsSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
import {afterEach, expect, it} from 'vitest'
import {makeRunTypescript} from '../src/call-tool.js'
import {createFakeHarness} from '../src/create-fake-harness.js'
import {createTestkit, type BootedApp} from '../src/create-testkit.js'
import {serveApp} from '../src/serve-app.js'
import {until} from '../src/until.js'

const state: {close: (() => Promise<void>) | null} = {close: null}

afterEach(async () => {
  if (state.close) await state.close()
  state.close = null
})

async function stalledServer(): Promise<string> {
  const served = await serveApp(() => new Promise<Response>(() => {}))
  state.close = () => served.close()
  return served.base
}

it('a stalled /api/mcp fails inside its budget with the stage that blew it', async () => {
  const base = await stalledServer()
  const started = Date.now()
  await expect(makeRunTypescript(base, 'session', {deadlineMs: 700, label: 'page.fill'})('return 1')).rejects.toThrow(
    /page\.fill.*700ms.*connecting/,
  )
  expect(Date.now() - started).toBeLessThan(4_000)
}, 5_000)

it('an app that never finishes booting fails inside its budget naming the boot stage', async () => {
  const kit = createTestkit(createFakeHarness(), () => new Promise(() => {}), {bootTimeoutMs: 700})
  const started = Date.now()
  await expect(kit.setup()).rejects.toThrow(/700ms at boot/)
  expect(Date.now() - started).toBeLessThan(4_000)
}, 5_000)

it('removes the state root when boot blows its budget', async () => {
  const booted = {stateRoot: ''}
  const kit = createTestkit(
    createFakeHarness(),
    (env) => {
      booted.stateRoot = env.stateRoot
      return new Promise<BootedApp>(() => {})
    },
    {bootTimeoutMs: 300},
  )
  await expect(kit.setup()).rejects.toThrow(/300ms at boot/)
  expect(booted.stateRoot).not.toBe('')
  expect(existsSync(booted.stateRoot)).toBe(false)
}, 5_000)

it('disposes an app that finishes booting after the budget', async () => {
  const served = await serveApp(() => new Response('ok'))
  const kit = createTestkit(
    createFakeHarness(),
    async () => {
      await delay(500)
      return {fetch: () => new Response('ok'), dispose: () => served.close()}
    },
    {bootTimeoutMs: 200},
  )
  await expect(kit.setup()).rejects.toThrow(/200ms at boot/)
  await until(
    async () =>
      fetch(served.base).then(
        () => false,
        () => true,
      ),
    {hangGuardMs: 3_000},
  )
}, 6_000)
