import {createContext, useContext} from 'solid-js'
import type {createPluginAttachment} from './host-apis'
import {widgetPluginErrors} from '@conciv/errors'

const AttachmentContext = createContext<ReturnType<typeof createPluginAttachment>>()

export function usePluginAttachment() {
  const value = useContext(AttachmentContext)

  if (!value) throw widgetPluginErrors.ATTACHMENT_UNAVAILABLE()

  return value
}

export const PluginAttachmentProvider = AttachmentContext.Provider
