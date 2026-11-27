import {createContext, useContext} from 'solid-js'
import {widgetErrors} from '@conciv/errors'

export type PanelChrome = {
  close: () => void
  frame: (element: HTMLElement) => void
}

export const PanelChromeContext = createContext<PanelChrome>()

export function usePanelChrome(): PanelChrome {
  const value = useContext(PanelChromeContext)
  if (!value) throw widgetErrors.OUTSIDE_PROVIDER({hook: 'usePanelChrome', provider: 'the panel chrome provider'})
  return value
}
