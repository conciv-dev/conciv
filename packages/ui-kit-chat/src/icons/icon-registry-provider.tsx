import {createContext, useContext, type JSX, type ParentProps} from 'solid-js'
import {createIconRegistry, type IconRegistry} from './registry.js'

const IconRegistryContext = createContext<IconRegistry>()

export function IconRegistryProvider(props: ParentProps): JSX.Element {
  return <IconRegistryContext.Provider value={createIconRegistry()}>{props.children}</IconRegistryContext.Provider>
}

export function useIconRegistry(): IconRegistry {
  const registry = useContext(IconRegistryContext)

  if (!registry) throw new Error('Icon registry is unavailable: mount an IconRegistryProvider at the app root')

  return registry
}
