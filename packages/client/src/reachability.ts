import {createEffect, createSignal, onCleanup, type Accessor} from 'solid-js'
import {Debouncer} from '@tanstack/pacer'
import {onlineManager} from '@tanstack/query-core'
import {ORPCError} from '@orpc/client'
import {isRetryableRpcFailure, subscribeRpcReachability} from '@conciv/contract'

export const ENGINE_OFFLINE_GRACE_MS = 1000

export function isReachabilityError(error: unknown): boolean {
  return !(error instanceof ORPCError)
}

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

type ReachabilityHub = {
  setOnline: ((online: boolean) => void) | undefined
  detachNative: (() => void) | undefined
  registrationCount: number
}

const hub: ReachabilityHub = {setOnline: undefined, detachNative: undefined, registrationCount: 0}

const hubSetup: OnlineSetup = (setOnline) => {
  hub.setOnline = setOnline
  hub.detachNative = defaultBrowserSetup(setOnline)
  return () => {
    hub.detachNative?.()
    hub.detachNative = undefined
    hub.setOnline = undefined
  }
}

function registerReachabilitySource(): () => void {
  if (hub.registrationCount === 0) onlineManager.setEventListener(hubSetup)
  hub.registrationCount += 1
  let released = false
  return () => {
    if (released) return
    released = true
    hub.registrationCount -= 1
    if (hub.registrationCount === 0) onlineManager.setEventListener(defaultBrowserSetup)
  }
}

export function setupEngineReachability(apiBase: string): () => void {
  const releaseSource = registerReachabilitySource()
  const unsubscribeRpc = subscribeRpcReachability(apiBase, (reachable) => hub.setOnline?.(reachable))
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    unsubscribeRpc()
    releaseSource()
  }
}

export function engineOnline(): Accessor<boolean> {
  const [online, setOnline] = createSignal(onlineManager.isOnline())
  onCleanup(onlineManager.subscribe(setOnline))
  return online
}

export function sustainedEngineOffline(graceMs = ENGINE_OFFLINE_GRACE_MS): Accessor<boolean> {
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

export const ENGINE_PROBE_INTERVAL_MS = 2000
export const ENGINE_HEARTBEAT_INTERVAL_MS = 30_000

export function engineProbeRefetchInterval(reachable: boolean, heartbeat: boolean): number | false {
  if (!reachable) return ENGINE_PROBE_INTERVAL_MS
  return heartbeat ? ENGINE_HEARTBEAT_INTERVAL_MS : false
}

export function subscribeEngineOnline(listener: () => void): () => void {
  return onlineManager.subscribe((online) => {
    if (online) listener()
  })
}

export function voteEngineProbeSettled(succeeded: boolean, error?: unknown): void {
  if (succeeded) {
    onlineManager.setOnline(true)
    return
  }
  onlineManager.setOnline(!isRetryableRpcFailure(true, error))
}
