import {createContext, useContext} from 'solid-js'
import type {RpcClient} from '@conciv/contract'
import type {GrabApi} from '@conciv/grab'
import type {DialogApi} from '@conciv/ui-kit-system'
import type {ExtensionSlot} from './types.js'

export type ColorScheme = 'light' | 'dark'
export type Toast = (message: string, tone?: 'info' | 'success' | 'error') => void

export type HostWiring = {
  rpc: RpcClient
  apiBase: () => string
  toast: Toast
  registerLayer: (isOpen: () => boolean, hides: boolean) => () => void
  dialog: DialogApi
  sessionId: () => string | null
  grab: GrabApi
  attach: (file: File) => void
  newSession: () => void
  viewLock: (locked: boolean) => void
  viewLeave: () => void
  slot: ExtensionSlot
  colorScheme: () => ColorScheme
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
