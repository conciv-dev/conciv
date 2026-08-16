import {describe, expect, it} from 'vitest'
import {
  createEventBus,
  createEventBusClient,
  GLOBAL_EVENT,
  type EventBusEnvelope,
  type EventBusScheduler,
} from '../src/event-bus.js'

type CommandMap = {
  open: undefined
  close: undefined
}

function createManualScheduler(): {scheduler: EventBusScheduler; tick: () => void; intervalCount: () => number} {
  const callbacks = new Map<number, () => void>()
  let nextId = 0
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
      },
    },
    tick: () => {
      for (const callback of callbacks.values()) callback()
    },
    intervalCount: () => callbacks.size,
  }
}

describe('createEventBusClient / createEventBus', () => {
  it('queues emits made before the handshake completes and flushes them in order once acked', () => {
    const target = new EventTarget()
    const {scheduler, tick} = createManualScheduler()
    const received: unknown[] = []
    const bus = createEventBus({target: () => target})
    const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    listener.on('open', (event) => received.push([event.type, event.pluginId]))
    listener.on('close', (event) => received.push([event.type, event.pluginId]))

    const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    client.emit('open', undefined)
    client.emit('close', undefined)
    expect(received).toEqual([])
    expect(client.getState()).toBe('connecting')

    bus.start()
    expect(received).toEqual([])

    tick()
    expect(received).toEqual([
      ['panel:open', 'panel'],
      ['panel:close', 'panel'],
    ])
    expect(client.getState()).toBe('ready')
  })

  it('stops retrying once the bus acks the connection', () => {
    const target = new EventTarget()
    const {scheduler, tick, intervalCount} = createManualScheduler()
    const bus = createEventBus({target: () => target})
    bus.start()

    const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
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
      pluginId: 'panel',
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
    const bus = createEventBus({target: () => target})
    const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    listener.on('open', (event) => received.push(event))
    bus.start()
    expect(received).toEqual([])
  })

  it('restarts the handshake with a fresh retry budget when emit is called again after failure', () => {
    const target = new EventTarget()
    const {scheduler, tick} = createManualScheduler()
    const client = createEventBusClient<CommandMap>({
      pluginId: 'panel',
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
    const bus = createEventBus({target: () => target})
    const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    listener.on('close', (event) => received.push(event.type))
    bus.start()
    expect(received).toEqual([])

    tick()
    expect(received).toEqual(['panel:close'])
    expect(client.getState()).toBe('ready')
  })

  it('passes an emit straight through once the client is already connected', () => {
    const target = new EventTarget()
    const {scheduler} = createManualScheduler()
    const received: unknown[] = []
    const bus = createEventBus({target: () => target})
    const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    listener.on('open', (event) => received.push(event.payload))
    bus.start()

    const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    client.emit('open', undefined)
    expect(client.getState()).toBe('ready')

    client.emit('open', undefined)
    expect(received).toEqual([undefined, undefined])
  })

  it('re-dispatches every emit as both the specific envelope event and the global event', () => {
    const target = new EventTarget()
    const {scheduler} = createManualScheduler()
    const specific: EventBusEnvelope[] = []
    const global: EventBusEnvelope[] = []
    const bus = createEventBus({target: () => target})
    bus.start()
    target.addEventListener('panel:open', (event) => {
      if (event instanceof CustomEvent) specific.push(event.detail)
    })
    target.addEventListener(GLOBAL_EVENT, (event) => {
      if (event instanceof CustomEvent) global.push(event.detail)
    })

    const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    client.emit('open', undefined)

    expect(specific).toEqual([{type: 'panel:open', payload: undefined, pluginId: 'panel'}])
    expect(global).toEqual([{type: 'panel:open', payload: undefined, pluginId: 'panel'}])
  })

  it('filters onAll down to the listening client own pluginId', () => {
    const target = new EventTarget()
    const {scheduler} = createManualScheduler()
    const seen: string[] = []
    const bus = createEventBus({target: () => target})
    bus.start()

    const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    listener.onAll((event) => seen.push(event.type))

    const panelClient = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    const otherClient = createEventBusClient<CommandMap>({pluginId: 'other', target: () => target, scheduler})
    otherClient.emit('open', undefined)
    panelClient.emit('close', undefined)

    expect(seen).toEqual(['panel:close'])
  })

  it('stops delivering to a listener that unsubscribed and to every listener once the bus stops', () => {
    const target = new EventTarget()
    const {scheduler} = createManualScheduler()
    const seen: string[] = []
    const bus = createEventBus({target: () => target})
    bus.start()

    const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    const unsubscribe = listener.on('open', (event) => seen.push(event.type))

    const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
    client.emit('open', undefined)
    expect(seen).toEqual(['panel:open'])

    unsubscribe()
    client.emit('open', undefined)
    expect(seen).toEqual(['panel:open'])

    listener.on('close', (event) => seen.push(event.type))
    bus.stop()
    client.emit('close', undefined)
    expect(seen).toEqual(['panel:open'])
  })
})
