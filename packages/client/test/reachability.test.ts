import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createRoot} from 'solid-js'
import {ORPCError} from '@orpc/client'
import {onlineManager} from '@tanstack/query-core'
import {browserRpcConnection, closeBrowserRpcConnection} from '@conciv/contract'
import {
  fakeNativeSocketConstructor,
  nextSocket,
  resetFakeNativeSockets,
} from '../../contract/test/helpers/fake-native-socket.js'
import {
  ENGINE_HEARTBEAT_INTERVAL_MS,
  ENGINE_PROBE_INTERVAL_MS,
  engineOnline,
  engineProbeRefetchInterval,
  setupEngineReachability,
  sustainedEngineOffline,
  voteEngineProbeSettled,
} from '../src/reachability.js'

beforeEach(() => {
  resetFakeNativeSockets()
  vi.stubGlobal('WebSocket', fakeNativeSocketConstructor)
})

afterEach(() => {
  vi.unstubAllGlobals()
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
    cleanupOne()
    cleanupTwo()
  })

  it('two roots coexist: disposing the first leaves the second still driving onlineManager', async () => {
    const baseOne = apiBase('multiplex-first')
    const baseTwo = apiBase('multiplex-second')
    const cleanupOne = setupEngineReachability(baseOne)
    const cleanupTwo = setupEngineReachability(baseTwo)
    cleanupOne()
    onlineManager.setOnline(false)
    browserRpcConnection(baseTwo)
    const socket = await nextSocket()
    socket.open()
    expect(onlineManager.isOnline()).toBe(true)
    cleanupTwo()
    closeBrowserRpcConnection(baseTwo)
  })

  it('rebind: disposing and re-setting-up a slot does not detach a concurrently active second root', async () => {
    const otherBase = apiBase('rebind-other')
    const firstSlotBase = apiBase('rebind-a')
    const secondSlotBase = apiBase('rebind-b')
    const cleanupOther = setupEngineReachability(otherBase)
    let cleanupSlot = setupEngineReachability(firstSlotBase)
    cleanupSlot()
    cleanupSlot = setupEngineReachability(secondSlotBase)
    onlineManager.setOnline(false)
    browserRpcConnection(otherBase)
    const socket = await nextSocket()
    socket.open()
    expect(onlineManager.isOnline()).toBe(true)
    cleanupSlot()
    cleanupOther()
    closeBrowserRpcConnection(otherBase)
  })

  it('disposes cleanly regardless of order and remains reusable afterward', async () => {
    const baseA = apiBase('order-a')
    const baseB = apiBase('order-b')
    const cleanupA = setupEngineReachability(baseA)
    const cleanupB = setupEngineReachability(baseB)
    cleanupB()
    cleanupA()
    expect(() => cleanupA()).not.toThrow()

    const baseC = apiBase('order-c')
    const cleanupC = setupEngineReachability(baseC)
    onlineManager.setOnline(false)
    browserRpcConnection(baseC)
    const socket = await nextSocket()
    socket.open()
    expect(onlineManager.isOnline()).toBe(true)
    cleanupC()
    closeBrowserRpcConnection(baseC)
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
    let dispose = (): void => {}
    try {
      onlineManager.setOnline(true)
      const sustained = createRoot((disposeRoot) => {
        dispose = disposeRoot
        return sustainedEngineOffline(1000)
      })
      expect(sustained()).toBe(false)
      onlineManager.setOnline(false)
      vi.advanceTimersByTime(500)
      expect(sustained()).toBe(false)
      vi.advanceTimersByTime(600)
      expect(sustained()).toBe(true)
    } finally {
      dispose()
      vi.useRealTimers()
    }
  })

  it('a blip that recovers within the grace window never raises', () => {
    vi.useFakeTimers()
    let dispose = (): void => {}
    try {
      onlineManager.setOnline(true)
      const sustained = createRoot((disposeRoot) => {
        dispose = disposeRoot
        return sustainedEngineOffline(1000)
      })
      onlineManager.setOnline(false)
      vi.advanceTimersByTime(500)
      onlineManager.setOnline(true)
      vi.advanceTimersByTime(600)
      expect(sustained()).toBe(false)
    } finally {
      dispose()
      vi.useRealTimers()
    }
  })

  it('applies the grace period even when the manager is already offline at initialization', () => {
    vi.useFakeTimers()
    let dispose = (): void => {}
    try {
      onlineManager.setOnline(false)
      const sustained = createRoot((disposeRoot) => {
        dispose = disposeRoot
        return sustainedEngineOffline(1000)
      })
      expect(sustained()).toBe(false)
      vi.advanceTimersByTime(999)
      expect(sustained()).toBe(false)
      vi.advanceTimersByTime(1)
      expect(sustained()).toBe(true)
    } finally {
      dispose()
      vi.useRealTimers()
    }
  })
})

describe('engineProbeRefetchInterval', () => {
  it('stops polling once reachable with no heartbeat condition', () => {
    expect(engineProbeRefetchInterval(true, false)).toBe(false)
  })

  it('polls at the heartbeat interval once reachable when the heartbeat condition holds', () => {
    expect(engineProbeRefetchInterval(true, true)).toBe(ENGINE_HEARTBEAT_INTERVAL_MS)
  })

  it('polls at the offline probe interval while unreachable regardless of the heartbeat condition', () => {
    expect(engineProbeRefetchInterval(false, false)).toBe(ENGINE_PROBE_INTERVAL_MS)
    expect(engineProbeRefetchInterval(false, true)).toBe(ENGINE_PROBE_INTERVAL_MS)
  })
})

describe('voteEngineProbeSettled', () => {
  it('marks the manager online when the probe settles successfully', () => {
    onlineManager.setOnline(false)
    voteEngineProbeSettled(true)
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('votes offline when the probe fails with a transport error', () => {
    onlineManager.setOnline(true)
    voteEngineProbeSettled(false, new TypeError('fetch failed'))
    expect(onlineManager.isOnline()).toBe(false)
  })

  it('votes online when the probe fails with an ORPCError: the server answered, so it is reachable', () => {
    onlineManager.setOnline(false)
    voteEngineProbeSettled(false, new ORPCError('INTERNAL_SERVER_ERROR'))
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('defaults to a transport-failure vote when no error is supplied', () => {
    onlineManager.setOnline(true)
    voteEngineProbeSettled(false)
    expect(onlineManager.isOnline()).toBe(false)
  })
})
