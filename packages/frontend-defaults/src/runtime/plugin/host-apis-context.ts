import {createContext, useContext} from 'solid-js'
import type {HostApis} from './host-apis'

const HostApisContext = createContext<HostApis>()

export function useHostApis() {
  const value = useContext(HostApisContext)

  if (!value) throw new Error('Host APIs are unavailable')

  return value
}

export const HostApisProvider = HostApisContext.Provider
