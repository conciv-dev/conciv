import type {SessionId} from '@conciv/protocol/chat-types'

export type RunDriver = {runId: string; abort: AbortController; settled: Promise<void>}

export type RunDrivers = {
  drive: (sessionId: SessionId, driver: RunDriver) => void
  driverOf: (runId: string) => RunDriver | undefined
  onStart: (sessionId: SessionId, listener: (runId: string) => void) => () => void
}

export function createRunDrivers(): RunDrivers {
  const driving = new Map<string, RunDriver>()
  const listeners = new Map<string, Set<(runId: string) => void>>()
  return {
    drive: (sessionId, driver) => {
      driving.set(driver.runId, driver)
      void driver.settled.finally(() => driving.delete(driver.runId))
      for (const listener of listeners.get(sessionId) ?? []) listener(driver.runId)
    },
    driverOf: (runId) => driving.get(runId),
    onStart: (sessionId, listener) => {
      const registered = listeners.get(sessionId) ?? new Set()
      listeners.set(sessionId, registered)
      registered.add(listener)
      return () => {
        registered.delete(listener)
        if (registered.size === 0 && listeners.get(sessionId) === registered) listeners.delete(sessionId)
      }
    },
  }
}
