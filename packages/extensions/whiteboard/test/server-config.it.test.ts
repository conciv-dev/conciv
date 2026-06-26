import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'

const state: {stack: Stack} = {stack: undefined as never}

beforeAll(async () => {
  state.stack = await bootStack()
})

afterAll(async () => {
  await state.stack?.stop()
})

describe('whiteboard .server() jazz config', () => {
  it('serves the jazz server url and app id', async () => {
    const response = await fetch(`${state.stack.extBase}/config`)
    expect(response.status).toBe(200)
    const config = (await response.json()) as {serverUrl: string; appId: string}
    expect(config.serverUrl).toMatch(/^http/)
    expect(config.appId.length).toBeGreaterThan(0)
  })

  it('advertises a reachable jazz sync server', async () => {
    const config = (await (await fetch(`${state.stack.extBase}/config`)).json()) as {serverUrl: string}
    const reached = await fetch(config.serverUrl, {signal: AbortSignal.timeout(5000)})
    expect(typeof reached.status).toBe('number')
  })
})
