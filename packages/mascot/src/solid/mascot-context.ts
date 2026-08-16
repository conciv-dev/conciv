import {createContext, useContext} from 'solid-js'
import type {MascotPartProps, MascotService} from '../core/mascot.js'
import type {CurveStyle} from '../core/path.js'
import type {MascotPartName} from '../core/slot-contract.js'

export type {MascotPartName}

export type FollowSource = {follow?: boolean}

export type MascotContextValue = {
  service: MascotService
  partProps: (part: MascotPartName) => MascotPartProps
  effectHostProps: (id: string) => MascotPartProps
  claimPart: (part: MascotPartName, source?: FollowSource) => void
  claimEffect: () => void
  curve: () => CurveStyle | undefined
}

const MascotContext = createContext<MascotContextValue>()

export const MascotProvider = MascotContext.Provider

export function useMascotContext(): MascotContextValue {
  const context = useContext(MascotContext)
  if (context === undefined) throw new Error('a mascot part can only render inside <Mascot />')
  return context
}
