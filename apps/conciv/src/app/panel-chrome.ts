import {createContext, useContext} from 'solid-js'

export type PanelChrome = {
  close: () => void
  openedFrom: () => HTMLElement | null
}

export const PanelChromeContext = createContext<PanelChrome>()

export function usePanelChrome(): PanelChrome {
  const value = useContext(PanelChromeContext)
  if (!value) throw new Error('usePanelChrome called outside the panel chrome provider')
  return value
}
