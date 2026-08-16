import 'virtual:uno.css'
import {untrack, type JSX, type ParentProps} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import {TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection, type StoryConnectionOptions} from '../src/store/story-connection.js'
import {Composer as ComposerPrimitive} from '../src/primitives/composer/composer.js'
import {ComposerHandlersProvider, type ComposerHandlers} from '../src/primitives/composer/composer-handlers.js'
import {mountView} from './mount-view.js'

function ChatHost(props: ParentProps<{connection?: StoryConnectionOptions; handlers?: ComposerHandlers}>): JSX.Element {
  const chat = useChat({connection: storyConnection(untrack(() => props.connection))})
  const handlers = untrack(() => props.handlers ?? {})
  return (
    <ChatProvider chat={chat}>
      <ComposerHandlersProvider value={handlers}>{props.children}</ComposerHandlersProvider>
    </ChatProvider>
  )
}

function ComposerHarness(): JSX.Element {
  return (
    <ComposerPrimitive.Root>
      <ComposerPrimitive.Input aria-label="Message" />
      <TooltipIconButtonSlot tooltip="Send message">
        {(buttonProps) => <ComposerPrimitive.Send {...buttonProps()}>Send</ComposerPrimitive.Send>}
      </TooltipIconButtonSlot>
    </ComposerPrimitive.Root>
  )
}

it('submits the message when a Send wrapped in TooltipIconButtonSlot is clicked', async () => {
  const handlers: ComposerHandlers = {onSend: () => Promise.resolve()}
  mountView(() => (
    <ChatHost handlers={handlers}>
      <ComposerHarness />
    </ChatHost>
  ))

  await page.getByRole('textbox', {name: 'Message'}).fill('clicked through a tooltip icon button slot')
  await page.getByRole('button', {name: 'Send message'}).click()

  await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('')
})
