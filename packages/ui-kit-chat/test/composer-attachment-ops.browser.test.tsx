import 'virtual:uno.css'
import {render} from '@solidjs/testing-library'
import {untrack, type JSX, type ParentProps} from 'solid-js'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Composer as ComposerPrimitive} from '../src/primitives/composer/composer.js'
import {ComposerHandlersProvider} from '../src/primitives/composer/composer-handlers.js'
import {useComposerContext, type ComposerContextValue} from '../src/primitives/composer/composer-context.js'
import {
  createTextAttachmentAdapter,
  type Attachment,
  type AttachmentAdapter,
  type PendingAttachment,
} from '../src/primitives/attachment/attachment-adapter.js'

function textFile(body: string, name: string): File {
  return new File([body], name, {type: 'text/plain'})
}

function trackedAdapter(onRemove?: (attachment: Attachment) => void): AttachmentAdapter {
  const adapter = createTextAttachmentAdapter()
  return {
    ...adapter,
    remove: async (attachment) => {
      onRemove?.(attachment)
      await adapter.remove(attachment)
    },
  }
}

function ChatHost(props: ParentProps): JSX.Element {
  const chat = useChat({connection: storyConnection(untrack(() => undefined))})
  return (
    <ChatProvider chat={chat}>
      <ComposerHandlersProvider value={{}}>{props.children}</ComposerHandlersProvider>
    </ChatProvider>
  )
}

function ContextProbe(props: {onReady: (context: ComposerContextValue) => void}): JSX.Element {
  const context = useComposerContext()
  untrack(() => props.onReady(context))
  return null
}

function mountComposer(options: {onAdapterRemove?: (attachment: Attachment) => void} = {}): ComposerContextValue {
  let captured: ComposerContextValue | undefined
  render(() => (
    <ChatHost>
      <ComposerPrimitive.Root attachmentAdapter={trackedAdapter(options.onAdapterRemove)}>
        <ComposerPrimitive.Input aria-label="Message" />
        <ContextProbe
          onReady={(context) => {
            captured = context
          }}
        />
      </ComposerPrimitive.Root>
    </ChatHost>
  ))
  if (!captured) throw new Error('expected the composer context to be captured')
  return captured
}

it('addAttachment resolves the id of the attachment it created', async () => {
  const composer = mountComposer()

  const id = await composer.addAttachment(textFile('one', 'one.txt'))

  expect(id).not.toBeNull()
  expect(composer.hasAttachment(id ?? '')).toBe(true)
})

it('hasAttachment stops reporting an attachment once it is removed', async () => {
  const composer = mountComposer()
  const id = await composer.addAttachment(textFile('one', 'one.txt'))
  if (!id) throw new Error('expected the attachment to be added')

  await composer.removeAttachment(id)

  expect(composer.hasAttachment(id)).toBe(false)
})

it('replaceAttachment swaps the payload in place and keeps its position', async () => {
  const composer = mountComposer()
  const first = await composer.addAttachment(textFile('one', 'one.txt'))
  const second = await composer.addAttachment(textFile('two', 'two.txt'))
  if (!first || !second) throw new Error('expected both attachments to be added')

  const replaced = await composer.replaceAttachment(first, textFile('uno', 'uno.txt'))

  expect(replaced).not.toBeNull()
  expect(composer.attachments().map((entry) => entry.name)).toEqual(['uno.txt', 'two.txt'])
})

it('replaceAttachment is a no-op once the attachment is gone', async () => {
  const composer = mountComposer()
  const id = await composer.addAttachment(textFile('one', 'one.txt'))
  if (!id) throw new Error('expected the attachment to be added')
  await composer.removeAttachment(id)

  expect(await composer.replaceAttachment(id, textFile('uno', 'uno.txt'))).toBeNull()
  expect(composer.attachments()).toHaveLength(0)
})

it('replaceAttachment releases the displaced attachment through the adapter', async () => {
  const removed: string[] = []
  const composer = mountComposer({onAdapterRemove: (attachment) => removed.push(attachment.name)})
  const id = await composer.addAttachment(textFile('one', 'one.txt'))
  if (!id) throw new Error('expected the attachment to be added')

  await composer.replaceAttachment(id, textFile('uno', 'uno.txt'))

  expect(removed).toEqual(['one.txt'])
  expect(composer.attachments()).toHaveLength(1)
})

it('keeps the in-flight replacement out of the attachment list until the swap', async () => {
  const seenBetweenEmissions: number[] = []
  let composer: ComposerContextValue | undefined
  let nextId = 0
  const watchingAdapter: AttachmentAdapter = {
    accept: 'text/plain',
    add: async function* ({file}) {
      nextId += 1
      const pending: PendingAttachment = {
        id: `watched-${nextId}`,
        type: 'document',
        name: file.name,
        contentType: file.type,
        file,
        status: {type: 'running', reason: 'uploading', progress: 0},
      }
      yield pending
      seenBetweenEmissions.push(composer?.attachments().length ?? -1)
      yield {...pending, status: {type: 'requires-action', reason: 'composer-send'}}
    },
    remove: async () => {},
    send: async (attachment) => ({...attachment, status: {type: 'complete'}, content: []}),
  }
  let captured: ComposerContextValue | undefined
  render(() => (
    <ChatHost>
      <ComposerPrimitive.Root attachmentAdapter={watchingAdapter}>
        <ComposerPrimitive.Input aria-label="Message" />
        <ContextProbe
          onReady={(context) => {
            captured = context
          }}
        />
      </ComposerPrimitive.Root>
    </ChatHost>
  ))
  if (!captured) throw new Error('expected the composer context to be captured')
  composer = captured
  const id = await composer.addAttachment(textFile('one', 'one.txt'))
  if (!id) throw new Error('expected the attachment to be added')

  await composer.replaceAttachment(id, textFile('uno', 'uno.txt'))

  expect(seenBetweenEmissions).toEqual([1, 1])
  expect(composer.attachments().map((entry) => entry.name)).toEqual(['uno.txt'])
})
