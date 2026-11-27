import {createContext, useContext} from 'solid-js'
import type {createPluginAttachment} from './host-apis'
import {runtimePluginErrors} from './errors.js'

const AttachmentContext = createContext<ReturnType<typeof createPluginAttachment>>()

export function usePluginAttachment() {
  const value = useContext(AttachmentContext)

  if (!value) throw runtimePluginErrors.ATTACHMENT_UNAVAILABLE()

  return value
}

export const PluginAttachmentProvider = AttachmentContext.Provider
