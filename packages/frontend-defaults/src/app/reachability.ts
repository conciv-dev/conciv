import {createContext, createMemo, useContext, type Accessor} from 'solid-js'
import {engineOnline, sustainedEngineOffline} from '@conciv/client'
import type {EngineConnection, EngineConnectionTimings} from '@conciv/client'
import {engineLock, trustStatus, type EngineLock} from './engine-login.js'

export type EngineReachability = {
  online: Accessor<boolean>
  sustainedOffline: Accessor<boolean>
  locked: Accessor<EngineLock>
}

export const EngineReachabilityContext = createContext<EngineReachability>()

export function makeEngineReachability(
  connection: Accessor<EngineConnection | undefined>,
  timings?: Partial<EngineConnectionTimings>,
): EngineReachability {
  const status = createMemo(() => {
    const current = connection()
    return current === undefined ? undefined : trustStatus(current.trust)
  })
  const locked = createMemo(() => {
    const read = status()
    return read === undefined ? null : engineLock(read())
  })
  return {online: engineOnline(), sustainedOffline: sustainedEngineOffline(timings?.offlineGraceMs), locked}
}

export function useEngineReachability(): EngineReachability {
  const value = useContext(EngineReachabilityContext)
  if (!value) throw new Error('useEngineReachability called outside EngineReachabilityContext.Provider')
  return value
}
