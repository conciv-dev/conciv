import {createContext, useContext} from 'solid-js'
import type {MascotPartProps, MascotService} from '../core/mascot.js'
import type {CurveStyle} from '../core/path.js'

export type MascotPartName = 'head' | 'eyes' | 'antenna'

export type MascotContextValue = {
  service: MascotService
  partProps: (part: MascotPartName) => MascotPartProps
  effectHostProps: (id: string) => MascotPartProps
  claimPart: (part: MascotPartName) => void
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
