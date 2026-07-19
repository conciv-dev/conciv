import {createContext, useContext, type JSX} from 'solid-js'
import {Primitive} from '../util/primitive.js'
import {createActionButton, type ActionButtonState} from '../util/create-action-button.js'
import {useChatContext} from '../../store/chat-context.js'
import type {MultimodalContent, QueuedMessage} from '@tanstack/ai-client'
import {useComposerHandlers} from '../composer/composer-handlers.js'

export type {QueuedMessage} from '@tanstack/ai-client'

const QueueItemContext = createContext<QueuedMessage>()

export const QueueItemProvider = QueueItemContext.Provider

function useQueueItem(): QueuedMessage {
  const context = useContext(QueueItemContext)
  if (!context) throw new Error('QueueItem.* must be used within a QueueItemProvider')
  return context
}

type ContentParts = Exclude<MultimodalContent['content'], string>

function attachmentLabel(parts: ContentParts): string {
  const count = parts.filter((part) => part.type !== 'text').length
  return `${count} ${count === 1 ? 'attachment' : 'attachments'}`
}

function contentPartsText(parts: ContentParts): string {
  const text = parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
  return text || attachmentLabel(parts)
}

function queuedText(content: QueuedMessage['content']): string {
  if (typeof content === 'string') return content
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
    try {
      await chat.sendMessage(item.content, {whenBusy: 'interrupt'})
    } catch (error) {
      await chat.sendMessage(item.content).catch(() => {})
      throw error
    }
  }
  const steer = async () => {
    await handlers.onSteer?.()
    await resend()
  }
  return (): ActionButtonState => ({
    run: () => void steer().catch((error) => handlers.onSteerError?.(error)),
  })
})

const Remove = createActionButton('Remove from queue', () => {
  const item = useQueueItem()
  const chat = useChatContext()
  return (): ActionButtonState => ({run: () => chat.cancelQueued(item.id)})
})

export const QueueItem = {Text, Steer, Remove}
