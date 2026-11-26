import {createContext, useContext} from 'solid-js'
import type {createPluginAttachment} from './host-apis'

const AttachmentContext = createContext<ReturnType<typeof createPluginAttachment>>()

export function usePluginAttachment() {
  const value = useContext(AttachmentContext)

  if (!value) throw new Error('Plugin attachment is unavailable')

  return value
}

export const PluginAttachmentProvider = AttachmentContext.Provider
