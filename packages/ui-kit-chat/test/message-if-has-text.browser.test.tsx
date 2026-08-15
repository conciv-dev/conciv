import 'virtual:uno.css'
import {untrack, type JSX, type ParentProps} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {MessagePart} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Message} from '../src/primitives/message/message.js'
import {MessageProvider} from '../src/primitives/message/message-context.js'
import type {Turn} from '../src/store/grouping.js'
import {mountView} from './mount-view.js'

const GROUNDING = '<article class="card">Server Functions</article> at src/routes/index.tsx:44:9'

function grabDocumentPart(): MessagePart {
  return {
    type: 'document',
    source: {type: 'data', value: 'e30=', mimeType: 'application/vnd.conciv.grab+json'},
  }
}

function modelOnlyText(): MessagePart {
  const part: MessagePart = {type: 'text', content: GROUNDING}
  return Object.assign(part, {metadata: {modelOnly: true}})
}

function visibleText(): MessagePart {
  return {type: 'text', content: 'explain this'}
}

function turnOf(parts: MessagePart[]): Turn {
  return {key: 'turn-1', role: 'user', parts, start: 0, end: 0}
}

function Host(props: ParentProps<{parts: MessagePart[]}>): JSX.Element {
  const chat = useChat({connection: storyConnection(untrack(() => undefined))})
  const turn = untrack(() => turnOf(props.parts))
  return (
    <ChatProvider chat={chat}>
      <MessageProvider
        value={{
          message: () => turn,
          index: () => 0,
          pairing: () => ({byCallId: new Map(), hiddenResultIds: new Set<string>()}),
          isLast: () => true,
        }}
      >
        {props.children}
      </MessageProvider>
    </ChatProvider>
  )
}

function mount(parts: MessagePart[]): void {
  mountView(() => (
    <Host parts={parts}>
      <Message.If hasText>
        <span>bubble drawn</span>
      </Message.If>
    </Host>
  ))
}

it('a grab-only turn whose only text is model-only draws no bubble', async () => {
  mount([grabDocumentPart(), modelOnlyText()])

  await expect.element(page.getByText('bubble drawn')).not.toBeInTheDocument()
})

it('a turn with visible text still draws its bubble', async () => {
  mount([grabDocumentPart(), visibleText()])

  await expect.element(page.getByText('bubble drawn')).toBeVisible()
})

it('a turn whose text is only whitespace draws no bubble', async () => {
  mount([grabDocumentPart(), {type: 'text', content: '   '}])

  await expect.element(page.getByText('bubble drawn')).not.toBeInTheDocument()
})
