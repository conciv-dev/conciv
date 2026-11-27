import {createContext, useContext, type JSX} from 'solid-js'
import {Primitive} from '../util/primitive.js'
import {createActionButton, type ActionButtonState} from '../util/create-action-button.js'
import {useChatContext} from '../../store/chat-context.js'
import {PromptPresentationSchema, type SendContent, type QueuedMessage} from '@conciv/types/chat-message-types'
import {reportUnsent, useComposerHandlers} from '../composer/composer-handlers.js'
import {chatKitErrors} from '../../errors/errors.js'

export type {QueuedMessage} from '@conciv/types/chat-message-types'

const QueueItemContext = createContext<QueuedMessage>()

export const QueueItemProvider = QueueItemContext.Provider

function useQueueItem(): QueuedMessage {
  const context = useContext(QueueItemContext)
  if (!context) throw chatKitErrors.OUTSIDE_PROVIDER({part: 'QueueItem.*', provider: 'a QueueItemProvider'})
  return context
}

type ContentParts = Exclude<SendContent['content'], string>

function attachmentLabel(parts: ContentParts): string {
  const count = parts.filter((part) => part.type !== 'text').length
  return `${count} ${count === 1 ? 'attachment' : 'attachments'}`
}

function contentPartsText(parts: ContentParts): string {
  const text = parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
  return text || attachmentLabel(parts)
}

const COUNT_PLURALS = new Intl.PluralRules('en')

function noteLabel(count: number): string {
  return `${count} ${COUNT_PLURALS.select(count) === 'one' ? 'note' : 'notes'}`
}

function queuedText(content: QueuedMessage['content']): string {
  if (typeof content === 'string') return content
  const presented = PromptPresentationSchema.safeParse(content.metadata).data
  if (presented?.displayText.trim()) return presented.displayText
  if (presented && presented.comments.length > 0) return noteLabel(presented.comments.length)
  if (typeof content.content === 'string') return content.content
  return contentPartsText(content.content)
}

function Text(props: JSX.HTMLAttributes<HTMLSpanElement>): JSX.Element {
  const item = useQueueItem()
  return <Primitive.span {...props}>{props.children ?? queuedText(item.content)}</Primitive.span>
}

const Steer = createActionButton('Steer', () => {
  const item = useQueueItem()
  const chat = useChatContext()
  const handlers = useComposerHandlers()
  const resend = async () => {
    chat.cancelQueued(item.id)
    await chat.sendMessage(item.content, {whenBusy: 'interrupt'})
  }
  const steer = async () => {
    await handlers.onSteer?.()
    await resend()
  }
  return (): ActionButtonState => ({
    run: () =>
      void steer().catch((error: unknown) =>
        handlers.onSteerError ? handlers.onSteerError(error, item) : reportUnsent(error),
      ),
  })
})

const Remove = createActionButton('Remove from queue', () => {
  const item = useQueueItem()
  const chat = useChatContext()
  return (): ActionButtonState => ({run: () => chat.cancelQueued(item.id)})
})

export const QueueItem = {Text, Steer, Remove}
