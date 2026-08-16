import {createContext, useContext} from 'react'
import type {MascotPartProps, MascotService} from '../core/mascot.js'
import type {CurveStyle} from '../core/path.js'

export type MascotPartName = 'head' | 'eyes' | 'antenna'

export type ClaimToken = object

export type PartClaim = {token: ClaimToken; follow: boolean | undefined}

export type MascotClaims = {
  parts: Record<MascotPartName, PartClaim | undefined>
  effects: ReadonlySet<ClaimToken>
}

export type MascotContextValue = {
  service: MascotService
  partProps: (part: MascotPartName) => MascotPartProps
  effectHostProps: (id: string) => MascotPartProps
  claimPart: (part: MascotPartName, token: ClaimToken, follow: boolean | undefined) => () => void
  claimEffect: (token: ClaimToken) => () => void
  claimOf: (part: MascotPartName) => PartClaim | undefined
  effectCount: () => number
  curve: () => CurveStyle | undefined
}

const MascotContext = createContext<MascotContextValue | undefined>(undefined)

export const MascotProvider = MascotContext.Provider

export function useMascotContext(): MascotContextValue {
  const context = useContext(MascotContext)
  if (context === undefined) throw new Error('a mascot part can only render inside <Mascot />')
  return context
}
