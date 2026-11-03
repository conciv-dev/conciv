import {createContext, useContext, type Accessor} from 'solid-js'
import {sustainedEngineOffline} from '@conciv/client'

export type EngineReachability = {
  online: Accessor<boolean>
  sustainedOffline: Accessor<boolean>
}

export const EngineReachabilityContext = createContext<EngineReachability>()

export function makeEngineReachability(online: Accessor<boolean>): EngineReachability {
  return {online, sustainedOffline: sustainedEngineOffline(online)}
}

export function useEngineReachability(): EngineReachability {
  const value = useContext(EngineReachabilityContext)
  if (!value) throw new Error('useEngineReachability called outside EngineReachabilityContext.Provider')
  return value
}
