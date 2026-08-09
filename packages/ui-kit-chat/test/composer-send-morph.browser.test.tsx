import 'virtual:uno.css'
import {untrack, type JSX, type ParentProps} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../src/store/chat-context.js'
import {createTextChunks, storyConnection, type StoryConnectionOptions} from '../src/store/story-connection.js'
import {ComposerHandlersProvider} from '../src/primitives/composer/composer-handlers.js'
import {Composer} from '../src/styled/composer.js'
import {cleanupViews, mountView} from './mount-view.js'

afterEach(() => {
  cleanupViews()
})

function StyledHost(props: ParentProps<{connection?: StoryConnectionOptions}>): JSX.Element {
  const chat = useChat({connection: storyConnection(untrack(() => props.connection))})
  return (
    <ChatProvider chat={chat}>
      <ComposerHandlersProvider value={{}}>{props.children}</ComposerHandlersProvider>
    </ChatProvider>
  )
}

const SLOW_STREAM: StoryConnectionOptions = {
  chunks: createTextChunks('a long streamed answer that keeps the run busy'),
  chunkDelay: 200,
  runsUntilStopped: true,
}

it('shows send when idle and stop only while running with an empty input', async () => {
  mountView(() => (
    <StyledHost connection={SLOW_STREAM}>
      <Composer />
    </StyledHost>
  ))
  const input = page.getByRole('textbox', {name: 'Message'})
  const send = page.getByRole('button', {name: 'Send message'})
  const stop = page.getByRole('button', {name: 'Stop generating'})
  await expect.element(send).toBeVisible()
  await expect.element(stop).not.toBeInTheDocument()
  await userEvent.fill(input, 'first question')
  await userEvent.click(send)
  await expect.element(stop).toBeVisible()
  await expect.element(send).not.toBeInTheDocument()
})

it('typing during a run swaps stop back to send and stop click ends the run', async () => {
  mountView(() => (
    <StyledHost connection={SLOW_STREAM}>
      <Composer />
    </StyledHost>
  ))
  const input = page.getByRole('textbox', {name: 'Message'})
  await userEvent.fill(input, 'first question')
  await userEvent.click(page.getByRole('button', {name: 'Send message'}))
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
  await userEvent.fill(input, 'follow-up while running')
  await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).not.toBeInTheDocument()
  await userEvent.fill(input, '')
  const stop = page.getByRole('button', {name: 'Stop generating'})
  await expect.element(stop).toBeVisible()
  await userEvent.click(stop)
  await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
})
