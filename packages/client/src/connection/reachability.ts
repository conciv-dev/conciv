import {createEffect, createSignal, onCleanup, type Accessor} from 'solid-js'
import {Debouncer} from '@tanstack/pacer'
import {onlineManager} from '@tanstack/query-core'
import {defaultEngineConnectionTimings} from './engine-connection-machine.js'
import {isEngineUnreachable, type EngineConnection} from './engine-connection.js'

export function isReachabilityError(error: unknown): boolean {
  return isEngineUnreachable(error)
}

function defaultBrowserSetup(setOnline: (online: boolean) => void): (() => void) | undefined {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
  const goOnline = (): void => setOnline(true)
  const goOffline = (): void => setOnline(false)
  window.addEventListener('online', goOnline)
  window.addEventListener('offline', goOffline)
  return () => {
    window.removeEventListener('online', goOnline)
    window.removeEventListener('offline', goOffline)
  }
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function setupEngineReachability(connection: EngineConnection): () => void {
  onlineManager.setEventListener((setOnline) => {
    const detachNative = defaultBrowserSetup(setOnline)
    const unsubscribe = connection.subscribeReachability(setOnline)
    return () => {
      detachNative?.()
      unsubscribe()
    }
  })
  const state = {disposed: false}
  return () => {
    if (state.disposed) return
    state.disposed = true
    onlineManager.setEventListener(defaultBrowserSetup)
    onlineManager.setOnline(browserOnline())
  }
}

export function engineOnline(): Accessor<boolean> {
  const [online, setOnline] = createSignal(onlineManager.isOnline())
  onCleanup(onlineManager.subscribe(setOnline))
  return online
}

export function sustainedEngineOffline(graceMs = defaultEngineConnectionTimings.offlineGraceMs): Accessor<boolean> {
  const online = engineOnline()
  const [sustained, setSustained] = createSignal(false)
  const offlineDebouncer = new Debouncer(() => setSustained(true), {wait: graceMs})
  createEffect(() => {
    if (online()) {
      offlineDebouncer.cancel()
      setSustained(false)
      return
    }
    offlineDebouncer.maybeExecute()
  })
  onCleanup(() => offlineDebouncer.cancel())
  return sustained
}
