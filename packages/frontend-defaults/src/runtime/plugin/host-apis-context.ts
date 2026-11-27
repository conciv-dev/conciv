import {createContext, useContext} from 'solid-js'
import type {HostApis} from './host-apis'
import {runtimePluginErrors} from './errors.js'

const HostApisContext = createContext<HostApis>()

export function useHostApis() {
  const value = useContext(HostApisContext)

  if (!value) throw runtimePluginErrors.HOST_APIS_UNAVAILABLE()

  return value
}

export const HostApisProvider = HostApisContext.Provider
