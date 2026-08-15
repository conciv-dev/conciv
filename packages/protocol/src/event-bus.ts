declare const window: EventTarget | undefined

declare global {
  var __CONCIV_EVENT_BUS_TARGET__: EventTarget | undefined
}

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

export type EventBusClientState = 'idle' | 'connecting' | 'ready' | 'failed'

export type EventBusClientOptions = {
  channel: string
  target?: EventBusTarget
  scheduler?: EventBusScheduler
  reconnectEveryMs?: number
  maxRetries?: number
}

export type EventBusClient<TEventMap extends Record<string, unknown>> = {
  emit: <TName extends keyof TEventMap & string>(name: TName, payload: TEventMap[TName]) => void
  getState: () => EventBusClientState
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

type QueuedEvent = {name: string; payload: unknown}

export function createEventBusClient<TEventMap extends Record<string, unknown>>(
  options: EventBusClientOptions,
): EventBusClient<TEventMap> {
  const target = options.target ?? sharedEventTarget
  const scheduler = options.scheduler ?? defaultScheduler()
  const reconnectEveryMs = options.reconnectEveryMs ?? 300
  const maxRetries = options.maxRetries ?? 5
  const connectEventName = `${options.channel}:connect`
  const connectSuccessEventName = `${options.channel}:connect-success`

  let state: EventBusClientState = 'idle'
  let queue: QueuedEvent[] = []
  let retryCount = 0
  let intervalId: unknown = null
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) listener()
  }

  function dispatch(name: string, payload: unknown): void {
    target().dispatchEvent(new CustomEvent(name, {detail: payload}))
  }

  function flushQueue(): void {
    const pending = queue
    queue = []
    for (const event of pending) dispatch(event.name, event.payload)
  }

  function stopConnectLoop(): void {
    if (intervalId === null) return
    scheduler.clearInterval(intervalId)
    intervalId = null
  }

  function onConnectSuccess(): void {
    target().removeEventListener(connectSuccessEventName, onConnectSuccess)
    stopConnectLoop()
    state = 'ready'
    flushQueue()
    notify()
  }

  function attemptConnect(): void {
    if (retryCount >= maxRetries) {
      target().removeEventListener(connectSuccessEventName, onConnectSuccess)
      stopConnectLoop()
      state = 'failed'
      queue = []
      notify()
      return
    }
    retryCount += 1
    target().dispatchEvent(new CustomEvent(connectEventName))
  }

  function startHandshake(): void {
    state = 'connecting'
    target().addEventListener(connectSuccessEventName, onConnectSuccess)
    attemptConnect()
    if (state === 'connecting') intervalId = scheduler.setInterval(attemptConnect, reconnectEveryMs)
    notify()
  }

  function emit<TName extends keyof TEventMap & string>(name: TName, payload: TEventMap[TName]): void {
    if (state === 'ready') {
      dispatch(name, payload)
      return
    }
    if (state === 'failed') {
      retryCount = 0
      queue.push({name, payload})
      startHandshake()
      return
    }
    queue.push({name, payload})
    if (state === 'idle') startHandshake()
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
    target().removeEventListener(connectSuccessEventName, onConnectSuccess)
    listeners.clear()
    queue = []
  }

  return {emit, getState, subscribe, dispose}
}

export type EventBusHostOptions = {
  channel: string
  target?: EventBusTarget
}

export type EventBusHost<TEventMap extends Record<string, unknown>> = {
  on: <TName extends keyof TEventMap & string>(name: TName, handler: (payload: TEventMap[TName]) => void) => void
  ready: () => void
  dispose: () => void
}

type RegisteredListener = {name: string; listener: (event: Event) => void}

export function createEventBusHost<TEventMap extends Record<string, unknown>>(
  options: EventBusHostOptions,
): EventBusHost<TEventMap> {
  const target = options.target ?? sharedEventTarget
  const connectEventName = `${options.channel}:connect`
  const connectSuccessEventName = `${options.channel}:connect-success`
  const registered: RegisteredListener[] = []
  let connectListener: (() => void) | null = null

  function on<TName extends keyof TEventMap & string>(name: TName, handler: (payload: TEventMap[TName]) => void): void {
    const listener = (event: Event) => handler((event as CustomEvent<TEventMap[TName]>).detail)
    registered.push({name, listener})
    target().addEventListener(name, listener)
  }

  function ready(): void {
    if (connectListener) return
    connectListener = () => target().dispatchEvent(new CustomEvent(connectSuccessEventName))
    target().addEventListener(connectEventName, connectListener)
  }

  function dispose(): void {
    for (const entry of registered) target().removeEventListener(entry.name, entry.listener)
    registered.length = 0
    if (connectListener) {
      target().removeEventListener(connectEventName, connectListener)
      connectListener = null
    }
  }

  return {on, ready, dispose}
}

export const PANEL_COMMAND_CHANNEL = 'conciv:panel-commands'
export const OPEN_PANEL_EVENT = 'conciv:open-panel'
export const CLOSE_PANEL_EVENT = 'conciv:close-panel'
export const TOGGLE_PANEL_EVENT = 'conciv:toggle-panel'

export type PanelCommandEventMap = {
  [OPEN_PANEL_EVENT]: undefined
  [CLOSE_PANEL_EVENT]: undefined
  [TOGGLE_PANEL_EVENT]: undefined
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
