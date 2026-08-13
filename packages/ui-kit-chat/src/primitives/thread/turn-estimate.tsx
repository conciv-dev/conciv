import {createContext, useContext} from 'solid-js'
import type {Turn} from '../../store/grouping.js'

export type TurnEstimate = {height: number; exact: boolean}

export type TurnEstimator = {
  estimateTurn: (turn: Turn) => TurnEstimate | undefined
  reset: () => void
}

const TurnEstimateContext = createContext<TurnEstimator | undefined>()

export const TurnEstimateProvider = TurnEstimateContext.Provider

export function useTurnEstimator(): TurnEstimator | undefined {
  return useContext(TurnEstimateContext)
}
