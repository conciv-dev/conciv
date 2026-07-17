import {createContext, useContext, type Component, type ComponentProps} from 'solid-js'
import type {RpcClient} from '@conciv/contract'
import type {GrabApi} from '@conciv/grab'
import type {DialogApi, PopoverApi} from '@conciv/ui-kit-system'
import type {ExtensionSlot} from './types.js'

export type Toast = (message: string, tone?: 'info' | 'success' | 'error') => void
export type PopoverParts = {
  Root: Component<ComponentProps<PopoverApi['Root']>>
  Positioner: Component<ComponentProps<PopoverApi['Positioner']>>
  Content: Component<ComponentProps<PopoverApi['Content']>>
}

export type HostWiring = {
  rpc: RpcClient
  apiBase: string
  toast: Toast
  openEditor: (file: string, line?: number) => void
  registerLayer: (isOpen: () => boolean, hides: boolean) => () => void
  dialog: DialogApi
  popover: PopoverParts
  sessionId: () => string | null
  grab: GrabApi
  insert: (text: string) => void
  attach: (file: File) => void
  newSession: () => void
  viewLock: (locked: boolean) => void
  viewLeave: () => void
  slot: ExtensionSlot
  value: object
}

export const HostApiContext = createContext<Partial<HostWiring>>({})

export function use<Key extends keyof HostWiring>(key: Key, hook: string): HostWiring[Key] {
  const wired = useContext(HostApiContext)[key]
  if (wired === undefined) throw new Error(`@conciv/extension: ${hook} used outside a host that provides ${key}`)
  return wired
}

export function useExtensionValue(hook: string): object {
  return use('value', hook)
}
