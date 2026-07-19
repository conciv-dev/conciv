import {render} from 'solid-js/web'
import {afterEach, expect, test} from 'vitest'
import {onMount, type JSX} from 'solid-js'
import {makeRpcClient} from '@conciv/contract'
import {useChatSession} from '@conciv/client'
import {ChatProvider, Thread, type AttachmentCardSlot} from '@conciv/ui-kit-chat'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const userParts = [
  {type: 'text' as const, content: 'why?'},
  {type: 'document' as const, source: {type: 'data' as const, mimeType: 'application/x-test', value: 'eyJ4IjoxfQ=='}},
  {type: 'text' as const, content: 'clicked save', metadata: {modelOnly: true}},
  {
    type: 'image' as const,
    source: {type: 'data' as const, mimeType: 'image/png', value: PNG_PIXEL},
    metadata: {modelOnly: true},
  },
]

function mountThread(cards: readonly AttachmentCardSlot[]): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(() => <ThreadApp cards={cards} />, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return host
}

function ThreadApp(props: {cards: readonly AttachmentCardSlot[]}): JSX.Element {
  const chat = useChatSession({rpc: makeRpcClient('http://127.0.0.1:9'), sessionId: 'conciv_userturn'})
  onMount(() => void chat.sendMessage({content: userParts}).catch(() => {}))
  return (
    <ChatProvider chat={chat}>
      <Thread attachmentCards={props.cards} />
    </ChatProvider>
  )
}

test('renders the matching card, hides modelOnly parts', async () => {
  const Card = (): JSX.Element => <span>test document player</span>
  const host = mountThread([{mime: 'application/x-test', render: Card}])
  await expect.poll(() => host.textContent).toContain('why?')
  expect(host.textContent).toContain('test document player')
  expect(host.textContent).not.toContain('clicked save')
  expect(host.querySelector('img')).toBeNull()
})

test('falls back to the generic tile with zero cards registered', async () => {
  const host = mountThread([])
  await expect.poll(() => host.textContent).toContain('why?')
  expect(host.querySelector('[data-attachment]')).not.toBeNull()
})
