import {createComponent, createContext, useContext, type JSX} from 'solid-js'
import type {HostApi} from './host-types.js'
import type {ExtensionSlot} from './types.js'
import {extensionError} from './errors.js'

type HostContextValue = {host: HostApi; slot: ExtensionSlot}

const HostContext = createContext<HostContextValue>()

export function HostProvider(props: {host: HostApi; slot: ExtensionSlot; children: JSX.Element}): JSX.Element {
  return createComponent(HostContext.Provider, {
    get value() {
      return {host: props.host, slot: props.slot}
    },
    get children() {
      return props.children
    },
  })
}

function requireHostContext(): HostContextValue {
  const value = useContext(HostContext)
  if (!value) throw extensionError('missing-host', 'useHost/useSlot called outside a HostProvider')
  return value
}

export function useHost(): HostApi {
  return requireHostContext().host
}

export function useSlot(): () => ExtensionSlot {
  const value = requireHostContext()
  return () => value.slot
}
