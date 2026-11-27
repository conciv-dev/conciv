import {createContext, useContext, type JSX, type ParentProps} from 'solid-js'
import {createIconRegistry, type IconRegistry} from './registry.js'
import {chatKitErrors} from '../errors/errors.js'

const IconRegistryContext = createContext<IconRegistry>()

export function IconRegistryProvider(props: ParentProps): JSX.Element {
  return <IconRegistryContext.Provider value={createIconRegistry()}>{props.children}</IconRegistryContext.Provider>
}

export function useIconRegistry(): IconRegistry {
  const registry = useContext(IconRegistryContext)

  if (!registry) throw chatKitErrors.ICON_REGISTRY_MISSING()

  return registry
}
