import {createContext, useContext, type JSX} from 'solid-js'
import {Primitive} from '../util/primitive.js'
import {useComposerContext, type AttachmentDraft} from '../composer/composer-context.js'

const AttachmentContext = createContext<AttachmentDraft>()

export const AttachmentProvider = AttachmentContext.Provider

export function useAttachment(): AttachmentDraft {
  const context = useContext(AttachmentContext)
  if (!context) throw new Error('Attachment.* must be used within a Composer.Attachments / Message.Attachments')
  return context
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : 'FILE'
}

function Root(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <Primitive.div data-attachment {...props} />
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
  const composer = useComposerContext()
  return (
    <button
      type="button"
      aria-label={`Remove ${attachment.name}`}
      onClick={() => composer.removeAttachment(attachment.id)}
      {...props}
    />
  )
}

export const Attachment = Object.assign(Root, {Root, Name, Thumb, Remove})
