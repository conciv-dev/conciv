import {afterEach, expect, it} from 'vitest'
import * as Y from 'yjs'
import {WebsocketProvider} from 'y-websocket'
import {bootStack, type Stack} from './helpers/boot-stack.js'

let stack: Stack | undefined

afterEach(async () => {
  await stack?.stop()
  stack = undefined
})

async function until(condition: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for convergence')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

it('two y-websocket clients on the same extension sync room converge', async () => {
  stack = await bootStack()
  const wsBase = `${stack.core.replace(/^http/, 'ws')}/api/ext/whiteboard/sync`
  const docA = new Y.Doc()
  const docB = new Y.Doc()
  const providerA = new WebsocketProvider(wsBase, 'room-a', docA, {disableBc: true})
  const providerB = new WebsocketProvider(wsBase, 'room-a', docB, {disableBc: true})
  try {
    await until(() => providerA.wsconnected && providerB.wsconnected)
    docA.getMap('shapes').set('rect-1', 'from-A')
    await until(() => docB.getMap('shapes').get('rect-1') === 'from-A')
    expect(docB.getMap('shapes').get('rect-1')).toBe('from-A')
  } finally {
    providerA.destroy()
    providerB.destroy()
  }
}, 30_000)
