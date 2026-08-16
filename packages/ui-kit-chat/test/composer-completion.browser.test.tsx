import 'virtual:uno.css'
import {createSignal, untrack, type Accessor, type JSX, type ParentProps} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {WebStorage} from '@conciv/storage-history'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection, type StoryConnectionOptions} from '../src/store/story-connection.js'
import {Composer as ComposerPrimitive} from '../src/primitives/composer/composer.js'
import {ComposerHandlersProvider, type ComposerHandlers} from '../src/primitives/composer/composer-handlers.js'
import {Error as ErrorPrimitive} from '../src/primitives/error/error.js'
import {mountView} from './mount-view.js'

const DRAFT_KEY = 'composer-draft-test'

function createProbeStorage(seed?: string): {storage: WebStorage; written: Accessor<string | null>} {
  const [written, setWritten] = createSignal<string | null>(seed ?? null)
  return {
    storage: {
      getItem: () => written(),
      setItem: (_key, value) => setWritten(value),
    },
    written,
  }
}

function ChatHost(props: ParentProps<{connection?: StoryConnectionOptions; handlers?: ComposerHandlers}>): JSX.Element {
  const chat = useChat({connection: storyConnection(untrack(() => props.connection))})
  const handlers = untrack(() => props.handlers ?? {})
  return (
    <ChatProvider chat={chat}>
      <ComposerHandlersProvider value={handlers}>{props.children}</ComposerHandlersProvider>
    </ChatProvider>
  )
}

function ComposerHarness(props: {storage?: WebStorage}): JSX.Element {
  return (
    <ComposerPrimitive.Root draftStorage={props.storage} draftKey={DRAFT_KEY}>
      <ComposerPrimitive.Input aria-label="Message" />
      <ComposerPrimitive.Quote />
      <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
      <ErrorPrimitive.Root>
        <ErrorPrimitive.Message />
      </ErrorPrimitive.Root>
    </ComposerPrimitive.Root>
  )
}

function seeded(draft: {text?: string; quote?: string | null}): string {
  return JSON.stringify({
    text: draft.text ?? '',
    quote: draft.quote ?? null,
    attachments: [],
  })
}

it('persists the typed draft into the supplied storage', async () => {
  const probe = createProbeStorage()
  mountView(() => (
    <ChatHost>
      <ComposerHarness storage={probe.storage} />
      <p>persisted: {probe.written() ?? 'nothing'}</p>
    </ChatHost>
  ))

  await page.getByRole('textbox', {name: 'Message'}).fill('a draft that outlives the reload')

  await expect
    .element(page.getByText(/persisted: .*"text":"a draft that outlives the reload"/), {timeout: 3000})
    .toBeVisible()
})

it('restores a persisted draft and quote when the composer mounts', async () => {
  const probe = createProbeStorage(seeded({text: 'kept across the reload', quote: 'a quoted line'}))
  mountView(() => (
    <ChatHost>
      <ComposerHarness storage={probe.storage} />
    </ChatHost>
  ))

  await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('kept across the reload')
  await expect.element(page.getByText('a quoted line')).toBeVisible()
})

it('restores the draft when the send handler rejects', async () => {
  const [sendError, setSendError] = createSignal('')
  const handlers: ComposerHandlers = {
    onSend: () => Promise.reject(new Error('the server rejected the send')),
    onSendError: (error) => setSendError(error instanceof Error ? error.message : String(error)),
  }
  mountView(() => (
    <ChatHost handlers={handlers}>
      <ComposerHarness />
      <p>send failed: {sendError()}</p>
    </ChatHost>
  ))

  await page.getByRole('textbox', {name: 'Message'}).fill('a message the server refuses')
  await page.getByRole('button', {name: 'Send'}).click()

  await expect.element(page.getByText('send failed: the server rejected the send')).toBeVisible()
  await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('a message the server refuses')
})

it('restores the draft when the chat run reports an error', async () => {
  mountView(() => (
    <ChatHost connection={{shouldError: true, error: new Error('the run never started')}}>
      <ComposerHarness />
    </ChatHost>
  ))

  await page.getByRole('textbox', {name: 'Message'}).fill('a message the run refuses')
  await page.getByRole('button', {name: 'Send'}).click()

  await expect.element(page.getByText('the run never started')).toBeVisible()
  await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('a message the run refuses')
})
