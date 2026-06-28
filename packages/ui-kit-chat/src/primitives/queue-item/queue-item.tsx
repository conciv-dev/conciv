import {createContext, useContext, type JSX} from 'solid-js'
import {Primitive} from '../util/primitive.js'
import {createActionButton, type ActionButtonState} from '../util/create-action-button.js'
import {useComposerHandlers} from '../composer/composer-handlers.js'

// A locally-queued pending message (widget-owned). The widget renders a list, wrapping each item in
// QueueItemProvider; Steer/Remove gate on the queue handlers (§7).
export type QueuedMessage = {id: string; text: string}

const QueueItemContext = createContext<QueuedMessage>()

export const QueueItemProvider = QueueItemContext.Provider

function useQueueItem(): QueuedMessage {
  const context = useContext(QueueItemContext)
  if (!context) throw new Error('QueueItem.* must be used within a QueueItemProvider')
  return context
}

function Text(props: JSX.HTMLAttributes<HTMLSpanElement>): JSX.Element {
  const item = useQueueItem()
  return <Primitive.span {...props}>{props.children ?? item.text}</Primitive.span>
}

const Steer = createActionButton('Steer', () => {
  const item = useQueueItem()
  const handlers = useComposerHandlers()
  return (): ActionButtonState | null => (handlers.steerQueued ? {run: () => handlers.steerQueued?.(item.id)} : null)
})

const Remove = createActionButton('Remove from queue', () => {
  const item = useQueueItem()
  const handlers = useComposerHandlers()
  return (): ActionButtonState | null => (handlers.removeQueued ? {run: () => handlers.removeQueued?.(item.id)} : null)
})

export const QueueItem = {Text, Steer, Remove}
