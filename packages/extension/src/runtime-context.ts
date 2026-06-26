import {createContext, useContext} from 'solid-js'
import type {ExtensionHostContext} from './types.js'

export const ExtensionRuntimeContext = createContext<ExtensionHostContext>()

export function useExtensionRuntimeContext(): ExtensionHostContext {
  const value = useContext(ExtensionRuntimeContext)
  if (!value) throw new Error('useExtensionRuntimeContext called outside an ExtensionRuntimeContext provider')
  return value
}
