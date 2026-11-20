import {createContext, createMemo, useContext, type Accessor} from 'solid-js'
import {engineOnline, sustainedEngineOffline} from '@conciv/client'
import type {EngineConnectionTimings} from '@conciv/contract'
import {createEngineLogin, engineLock, type EngineLock} from './engine-login.js'

export type EngineReachability = {
  online: Accessor<boolean>
  sustainedOffline: Accessor<boolean>
  locked: Accessor<EngineLock>
}

export const EngineReachabilityContext = createContext<EngineReachability>()

export function makeEngineReachability(
  apiBase: Accessor<string>,
  timings?: Partial<EngineConnectionTimings>,
): EngineReachability {
  const login = createEngineLogin({apiBase, timings})
  const locked = createMemo(() => engineLock(login.status()))
  return {online: engineOnline(), sustainedOffline: sustainedEngineOffline(), locked}
}

export function useEngineReachability(): EngineReachability {
  const value = useContext(EngineReachabilityContext)
  if (!value) throw new Error('useEngineReachability called outside EngineReachabilityContext.Provider')
  return value
}
