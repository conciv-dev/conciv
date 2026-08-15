import type {JSX} from 'solid-js'
import {AttachmentProvider, type PendingAttachment} from '@conciv/ui-kit-chat'

export function mountAttachment(file: File, children: () => JSX.Element): JSX.Element {
  const attachment: PendingAttachment = {
    id: 'grab-1',
    type: 'document',
    name: file.name,
    contentType: file.type,
    file,
    status: {type: 'requires-action', reason: 'composer-send'},
  }
  return <AttachmentProvider value={attachment}>{children()}</AttachmentProvider>
}
