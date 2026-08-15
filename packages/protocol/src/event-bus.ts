declare const window: EventTarget | undefined

declare global {
  var __CONCIV_EVENT_BUS_TARGET__: EventTarget | undefined
}

export const DISPATCH_EVENT = 'conciv-dispatch-event'
export const CONNECT_EVENT = 'conciv-connect'
export const CONNECT_SUCCESS_EVENT = 'conciv-connect-success'
export const GLOBAL_EVENT = 'conciv-global'

function sharedEventTarget(): EventTarget {
  if (typeof window !== 'undefined') return window
  if (globalThis.__CONCIV_EVENT_BUS_TARGET__ === undefined) globalThis.__CONCIV_EVENT_BUS_TARGET__ = new EventTarget()
  return globalThis.__CONCIV_EVENT_BUS_TARGET__
}

export type EventBusTarget = () => EventTarget

export type EventBusScheduler = {
  setInterval: (callback: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

function isTimerHandle(id: unknown): id is Parameters<typeof clearInterval>[0] {
  return id !== null
}

function defaultScheduler(): EventBusScheduler {
  return {
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (id) => {
      if (!isTimerHandle(id)) return
      clearInterval(id)
    },
  }
}

export type EventBusEnvelope<TPayload = unknown> = {
  type: string
  payload: TPayload
  pluginId: string
}

function customEventDetail<TDetail>(event: Event): TDetail | null {
  if (!(event instanceof CustomEvent)) return null
  const detail: TDetail | null | undefined = event.detail
  return detail ?? null
}

function readEnvelope(event: Event): EventBusEnvelope | null {
  const detail = customEventDetail<unknown>(event)
  if (typeof detail !== 'object' || detail === null) return null
  if (!('type' in detail) || !('payload' in detail) || !('pluginId' in detail)) return null
  const {type, payload, pluginId} = detail
  if (typeof type !== 'string' || typeof pluginId !== 'string') return null
  return {type, payload, pluginId}
}

export type EventBusOptions = {
  target?: EventBusTarget
}

export type EventBus = {
  start: () => void
  stop: () => void
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const target = options.target ?? sharedEventTarget
  let started = false

  function redispatch(event: Event): void {
    const envelope = readEnvelope(event)
    if (!envelope) return
    target().dispatchEvent(new CustomEvent(envelope.type, {detail: envelope}))
    target().dispatchEvent(new CustomEvent(GLOBAL_EVENT, {detail: envelope}))
  }

  function acknowledgeConnect(): void {
    target().dispatchEvent(new CustomEvent(CONNECT_SUCCESS_EVENT))
  }

  function start(): void {
    if (started) return
    started = true
    target().addEventListener(DISPATCH_EVENT, redispatch)
    target().addEventListener(CONNECT_EVENT, acknowledgeConnect)
  }

  function stop(): void {
    if (!started) return
    started = false
    target().removeEventListener(DISPATCH_EVENT, redispatch)
    target().removeEventListener(CONNECT_EVENT, acknowledgeConnect)
  }

  return {start, stop}
}

export type EventBusClientState = 'idle' | 'connecting' | 'ready' | 'failed'

export type EventBusClientOptions = {
  pluginId: string
  target?: EventBusTarget
  scheduler?: EventBusScheduler
  reconnectEveryMs?: number
  maxRetries?: number
}

export type EventBusClient<TEventMap extends Record<string, unknown>> = {
  emit: <TName extends keyof TEventMap & string>(name: TName, payload: TEventMap[TName]) => void
  on: <TName extends keyof TEventMap & string>(
    name: TName,
    handler: (event: EventBusEnvelope<TEventMap[TName]>) => void,
  ) => () => void
  onAll: (handler: (event: EventBusEnvelope) => void) => () => void
  getState: () => EventBusClientState
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

export function createEventBusClient<TEventMap extends Record<string, unknown>>(
  options: EventBusClientOptions,
): EventBusClient<TEventMap> {
  const target = options.target ?? sharedEventTarget
  const scheduler = options.scheduler ?? defaultScheduler()
  const reconnectEveryMs = options.reconnectEveryMs ?? 300
  const maxRetries = options.maxRetries ?? 5
  const pluginId = options.pluginId

  let state: EventBusClientState = 'idle'
  let queue: EventBusEnvelope[] = []
  let retryCount = 0
  let intervalId: unknown = null
  const listeners = new Set<() => void>()

  function eventName(name: string): string {
    return `${pluginId}:${name}`
  }

  function envelopeFor<TName extends keyof TEventMap & string>(
    name: TName,
    payload: TEventMap[TName],
  ): EventBusEnvelope<TEventMap[TName]> {
    return {type: eventName(name), payload, pluginId}
  }

  function notify(): void {
    for (const listener of listeners) listener()
  }

  function sendToBus(envelope: EventBusEnvelope): void {
    target().dispatchEvent(new CustomEvent(DISPATCH_EVENT, {detail: envelope}))
  }

  function flushQueue(): void {
    const pending = queue
    queue = []
    for (const envelope of pending) sendToBus(envelope)
  }

  function stopConnectLoop(): void {
    if (intervalId === null) return
    scheduler.clearInterval(intervalId)
    intervalId = null
  }

  function onConnectSuccess(): void {
    target().removeEventListener(CONNECT_SUCCESS_EVENT, onConnectSuccess)
    stopConnectLoop()
    state = 'ready'
    flushQueue()
    notify()
  }

  function attemptConnect(): void {
    if (retryCount >= maxRetries) {
      target().removeEventListener(CONNECT_SUCCESS_EVENT, onConnectSuccess)
      stopConnectLoop()
      state = 'failed'
      queue = []
      notify()
      return
    }
    retryCount += 1
    target().dispatchEvent(new CustomEvent(CONNECT_EVENT))
  }

  function startHandshake(): void {
    state = 'connecting'
    target().addEventListener(CONNECT_SUCCESS_EVENT, onConnectSuccess)
    attemptConnect()
    if (state === 'connecting') intervalId = scheduler.setInterval(attemptConnect, reconnectEveryMs)
    notify()
  }

  function emit<TName extends keyof TEventMap & string>(name: TName, payload: TEventMap[TName]): void {
    const envelope = envelopeFor(name, payload)
    if (state === 'ready') {
      sendToBus(envelope)
      return
    }
    if (state === 'failed') {
      retryCount = 0
      queue.push(envelope)
      startHandshake()
      return
    }
    queue.push(envelope)
    if (state === 'idle') startHandshake()
  }

  function on<TName extends keyof TEventMap & string>(
    name: TName,
    handler: (event: EventBusEnvelope<TEventMap[TName]>) => void,
  ): () => void {
    const fullName = eventName(name)
    const listener = (event: Event) => {
      const envelope = customEventDetail<EventBusEnvelope<TEventMap[TName]>>(event)
      if (!envelope) return
      handler(envelope)
    }
    target().addEventListener(fullName, listener)
    return () => target().removeEventListener(fullName, listener)
  }

  function onAll(handler: (event: EventBusEnvelope) => void): () => void {
    const listener = (event: Event) => {
      const envelope = readEnvelope(event)
      if (!envelope || envelope.pluginId !== pluginId) return
      handler(envelope)
    }
    target().addEventListener(GLOBAL_EVENT, listener)
    return () => target().removeEventListener(GLOBAL_EVENT, listener)
  }

  function getState(): EventBusClientState {
    return state
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function dispose(): void {
    stopConnectLoop()
    target().removeEventListener(CONNECT_SUCCESS_EVENT, onConnectSuccess)
    listeners.clear()
    queue = []
  }

  return {emit, on, onAll, getState, subscribe, dispose}
}

export const PANEL_PLUGIN_ID = 'panel'

export type PanelCommandEventMap = {
  open: undefined
  close: undefined
  toggle: undefined
}

export const CONNECTION_CHANGED_EVENT = 'conciv:connection-changed'
export const PANEL_TOGGLED_EVENT = 'conciv:panel-toggled'

export type WidgetConnectionChangedDetail = {connected: boolean}

export type WidgetPanelToggledDetail = {
  open: boolean
  connected: boolean
  mascotRect: {x: number; y: number; width: number; height: number} | null
}

export type WidgetStatusEventMap = {
  [CONNECTION_CHANGED_EVENT]: WidgetConnectionChangedDetail
  [PANEL_TOGGLED_EVENT]: WidgetPanelToggledDetail
}
