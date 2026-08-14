import {createEffect, createSignal, onCleanup, type Accessor} from 'solid-js'
import {debounce} from '@solid-primitives/scheduled'
import {onlineManager} from '@tanstack/query-core'
import {subscribeRpcReachability} from '@conciv/contract'

export const ENGINE_OFFLINE_GRACE_MS = 1000

type OnlineSetup = (setOnline: (online: boolean) => void) => (() => void) | undefined

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

function rpcReachabilitySetup(apiBase: string): OnlineSetup {
  return (setOnline) => {
    const unsubscribeRpc = subscribeRpcReachability(apiBase, (reachable) => setOnline(reachable))
    const detachNative = defaultBrowserSetup(setOnline)
    return () => {
      unsubscribeRpc()
      detachNative?.()
    }
  }
}

export function setupEngineReachability(apiBase: string): () => void {
  onlineManager.setEventListener(rpcReachabilitySetup(apiBase))
  return () => onlineManager.setEventListener(defaultBrowserSetup)
}

export function engineOnline(): Accessor<boolean> {
  const [online, setOnline] = createSignal(onlineManager.isOnline())
  onCleanup(onlineManager.subscribe(setOnline))
  return online
}

export function sustainedEngineOffline(graceMs = ENGINE_OFFLINE_GRACE_MS): Accessor<boolean> {
  const online = engineOnline()
  const [sustained, setSustained] = createSignal(!online())
  const scheduleOffline = debounce(() => setSustained(true), graceMs)
  createEffect(() => {
    if (online()) {
      scheduleOffline.clear()
      setSustained(false)
      return
    }
    scheduleOffline()
  })
  onCleanup(() => scheduleOffline.clear())
  return sustained
}

const ENGINE_PROBE_INTERVAL_MS = 2000

export function engineProbeRefetchInterval(reachable: boolean, intervalMs = ENGINE_PROBE_INTERVAL_MS): number | false {
  return reachable ? false : intervalMs
}
