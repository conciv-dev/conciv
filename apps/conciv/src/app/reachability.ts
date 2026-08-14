import {createContext, useContext, type Accessor} from 'solid-js'
import {engineOnline, sustainedEngineOffline} from '@conciv/client'

export type EngineReachability = {
  online: Accessor<boolean>
  sustainedOffline: Accessor<boolean>
}

export const EngineReachabilityContext = createContext<EngineReachability>()

export function makeEngineReachability(): EngineReachability {
  return {online: engineOnline(), sustainedOffline: sustainedEngineOffline()}
}

export function useEngineReachability(): EngineReachability {
  const value = useContext(EngineReachabilityContext)
  if (!value) throw new Error('useEngineReachability called outside EngineReachabilityContext.Provider')
  return value
}
