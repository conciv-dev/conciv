import {describe, expect, it} from 'vitest'
import {createEventBusClient, createEventBusHost, type EventBusScheduler} from '../src/event-bus.js'

type CommandMap = {
  open: undefined
  close: undefined
}

function createManualScheduler(): {scheduler: EventBusScheduler; tick: () => void; intervalCount: () => number} {
  const callbacks = new Map<number, () => void>()
  let nextId = 0
  let cleared = 0
  return {
    scheduler: {
      setInterval: (callback) => {
        const id = nextId
        nextId += 1
        callbacks.set(id, callback)
        return id
      },
      clearInterval: (id) => {
        if (typeof id !== 'number') return
        callbacks.delete(id)
        cleared += 1
      },
    },
    tick: () => {
      for (const callback of callbacks.values()) callback()
    },
    intervalCount: () => callbacks.size - cleared,
  }
}

describe('createEventBusClient / createEventBusHost', () => {
  it('queues emits made before the handshake completes and flushes them in order once acked', () => {
    const target = new EventTarget()
    const {scheduler, tick} = createManualScheduler()
    const received: unknown[] = []
    const host = createEventBusHost<CommandMap>({channel: 'test-channel', target: () => target})
    host.on('open', (payload) => received.push(['open', payload]))
    host.on('close', (payload) => received.push(['close', payload]))

    const client = createEventBusClient<CommandMap>({channel: 'test-channel', target: () => target, scheduler})
    client.emit('open', undefined)
    client.emit('close', undefined)
    expect(received).toEqual([])
    expect(client.getState()).toBe('connecting')

    host.ready()
    expect(received).toEqual([])

    tick()
    expect(received).toEqual([
      ['open', null],
      ['close', null],
    ])
    expect(client.getState()).toBe('ready')
  })

  it('stops retrying once the host acks the connection', () => {
    const target = new EventTarget()
    const {scheduler, tick, intervalCount} = createManualScheduler()
    const host = createEventBusHost<CommandMap>({channel: 'test-channel', target: () => target})
    host.on('open', () => {})
    host.ready()

    const client = createEventBusClient<CommandMap>({channel: 'test-channel', target: () => target, scheduler})
    client.emit('open', undefined)
    expect(client.getState()).toBe('ready')
    expect(intervalCount()).toBe(0)

    tick()
    expect(client.getState()).toBe('ready')
  })

  it('gives up after the bounded retry count and drops the queue', () => {
    const target = new EventTarget()
    const {scheduler, tick} = createManualScheduler()
    const client = createEventBusClient<CommandMap>({
      channel: 'test-channel',
      target: () => target,
      scheduler,
      maxRetries: 2,
    })

    client.emit('open', undefined)
    expect(client.getState()).toBe('connecting')

    tick()
    expect(client.getState()).toBe('connecting')

    tick()
    expect(client.getState()).toBe('failed')

    const received: unknown[] = []
    const host = createEventBusHost<CommandMap>({channel: 'test-channel', target: () => target})
    host.on('open', (payload) => received.push(payload))
    host.ready()
    expect(received).toEqual([])
  })

  it('restarts the handshake with a fresh retry budget when emit is called again after failure', () => {
    const target = new EventTarget()
    const {scheduler, tick} = createManualScheduler()
    const client = createEventBusClient<CommandMap>({
      channel: 'test-channel',
      target: () => target,
      scheduler,
      maxRetries: 2,
    })

    client.emit('open', undefined)
    tick()
    tick()
    expect(client.getState()).toBe('failed')

    client.emit('close', undefined)
    expect(client.getState()).toBe('connecting')

    const received: unknown[] = []
    const host = createEventBusHost<CommandMap>({channel: 'test-channel', target: () => target})
    host.on('close', (payload) => received.push(payload))
    host.ready()
    expect(received).toEqual([])

    tick()
    expect(received).toEqual([null])
    expect(client.getState()).toBe('ready')
  })

  it('passes an emit straight through once the client is already connected', () => {
    const target = new EventTarget()
    const {scheduler} = createManualScheduler()
    const received: unknown[] = []
    const host = createEventBusHost<CommandMap>({channel: 'test-channel', target: () => target})
    host.on('open', (payload) => received.push(payload))
    host.ready()

    const client = createEventBusClient<CommandMap>({channel: 'test-channel', target: () => target, scheduler})
    client.emit('open', undefined)
    expect(client.getState()).toBe('ready')

    client.emit('open', undefined)
    expect(received).toEqual([null, null])
  })
})
