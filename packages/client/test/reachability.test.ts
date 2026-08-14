import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createRoot} from 'solid-js'
import {onlineManager} from '@tanstack/query-core'
import {browserRpcConnection, closeBrowserRpcConnection} from '@conciv/contract'
import {FakeNativeSocket, nextSocket} from '../../contract/test/helpers/fake-native-socket.js'
import {
  engineOnline,
  engineProbeRefetchInterval,
  setupEngineReachability,
  sustainedEngineOffline,
  voteEngineProbeSettled,
} from '../src/reachability.js'

let originalWebSocket: typeof globalThis.WebSocket | undefined

beforeEach(() => {
  FakeNativeSocket.instances = []
  originalWebSocket = globalThis.WebSocket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.WebSocket = FakeNativeSocket as any
})

afterEach(() => {
  globalThis.WebSocket = originalWebSocket as typeof globalThis.WebSocket
  onlineManager.setEventListener(() => undefined)
  onlineManager.setOnline(true)
})

function apiBase(name: string): string {
  return `http://client-reachability-${name}.test`
}

describe('setupEngineReachability', () => {
  it('drives onlineManager from rpc reachability votes and clears state on the returned cleanup', async () => {
    const base = apiBase('setup')
    let dispose = (): void => {}
    let cleanup = (): void => {}
    const online = createRoot((disposeRoot) => {
      dispose = disposeRoot
      cleanup = setupEngineReachability(base)
      return engineOnline()
    })
    browserRpcConnection(base)
    const socket = await nextSocket()
    socket.open()
    expect(online()).toBe(true)
    cleanup()
    closeBrowserRpcConnection(base)
    dispose()
  })

  it('is re-entrant: calling it again for a new base does not leak the old subscription', () => {
    const cleanupOne = setupEngineReachability(apiBase('one'))
    const cleanupTwo = setupEngineReachability(apiBase('two'))
    expect(cleanupOne).not.toBe(cleanupTwo)
    cleanupTwo()
  })
})

describe('engineOnline', () => {
  it('seeds from the current onlineManager state and tracks subsequent changes', () => {
    onlineManager.setOnline(false)
    const observed = createRoot((dispose) => {
      const online = engineOnline()
      const seed = online()
      onlineManager.setOnline(true)
      const after = online()
      dispose()
      return {seed, after}
    })
    expect(observed).toEqual({seed: false, after: true})
  })
})

describe('sustainedEngineOffline', () => {
  it('does not raise until the offline state survives the grace window', () => {
    vi.useFakeTimers()
    try {
      onlineManager.setOnline(true)
      const sustained = createRoot(() => sustainedEngineOffline(1000))
      expect(sustained()).toBe(false)
      onlineManager.setOnline(false)
      vi.advanceTimersByTime(500)
      expect(sustained()).toBe(false)
      vi.advanceTimersByTime(600)
      expect(sustained()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a blip that recovers within the grace window never raises', () => {
    vi.useFakeTimers()
    try {
      onlineManager.setOnline(true)
      const sustained = createRoot(() => sustainedEngineOffline(1000))
      onlineManager.setOnline(false)
      vi.advanceTimersByTime(500)
      onlineManager.setOnline(true)
      vi.advanceTimersByTime(600)
      expect(sustained()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('engineProbeRefetchInterval', () => {
  it('stops polling once reachable', () => {
    expect(engineProbeRefetchInterval(true)).toBe(false)
  })

  it('polls at the given interval while unreachable', () => {
    expect(engineProbeRefetchInterval(false, 3000)).toBe(3000)
  })
})

describe('voteEngineProbeSettled', () => {
  it('marks the manager online when the probe settles successfully', () => {
    onlineManager.setOnline(false)
    voteEngineProbeSettled(true)
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('leaves the manager untouched when the probe fails', () => {
    onlineManager.setOnline(false)
    voteEngineProbeSettled(false)
    expect(onlineManager.isOnline()).toBe(false)
  })
})
