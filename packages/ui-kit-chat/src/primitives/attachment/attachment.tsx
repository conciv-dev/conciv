import {createContext, useContext, type JSX} from 'solid-js'
import {Primitive} from '../util/primitive.js'
import {useComposerContext} from '../composer/composer-context.js'
import type {Attachment as AttachmentState} from './attachment-adapter.js'

const AttachmentContext = createContext<AttachmentState>()

export const AttachmentProvider = AttachmentContext.Provider

const AttachmentRemoveContext = createContext<(id: string) => void>()

export const AttachmentRemoveProvider = AttachmentRemoveContext.Provider

function useRemoveAttachment(): (id: string) => void {
  const remove = useContext(AttachmentRemoveContext)
  if (remove) return remove
  const composer = useComposerContext()
  return (id) => void composer.removeAttachment(id)
}

export function useAttachment(): AttachmentState {
  const context = useContext(AttachmentContext)
  if (!context) throw new Error('Attachment.* must be used within a Composer.Attachments / Message.Attachments')
  return context
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : 'FILE'
}

function Root(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const attachment = useAttachment()
  return <Primitive.div data-attachment="" data-status={attachment.status.type} {...props} />
}

function Name(props: JSX.HTMLAttributes<HTMLSpanElement>): JSX.Element {
  const attachment = useAttachment()
  return <Primitive.span {...props}>{props.children ?? attachment.name}</Primitive.span>
}

function Thumb(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const attachment = useAttachment()
  return <Primitive.div {...props}>{props.children ?? extension(attachment.name)}</Primitive.div>
}

function Remove(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const attachment = useAttachment()
  const remove = useRemoveAttachment()
  return (
    <button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => remove(attachment.id)} {...props} />
  )
}

export const Attachment = Object.assign(Root, {Root, Name, Thumb, Remove})
