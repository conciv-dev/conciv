import {createContext, useContext, type Accessor} from 'solid-js'

export type ViewportInternalValue = {
  element: Accessor<HTMLElement | undefined>
}

const ViewportInternalContext = createContext<ViewportInternalValue>()

export const ViewportInternalProvider = ViewportInternalContext.Provider

export function useViewportInternal(): ViewportInternalValue | undefined {
  return useContext(ViewportInternalContext)
}
