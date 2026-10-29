import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {onMount, type JSX} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider, ComposerHandlersProvider, createTextChunks, storyConnection} from '@conciv/ui-kit-chat'
import {EngineReachabilityContext} from '../src/app/reachability.js'
import {PaneComposer} from '../src/pane/pane-composer.jsx'
import {memoryStorage} from './helpers/memory-storage.js'

function Harness(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({chunks: createTextChunks('working on it'), runsUntilStopped: true}),
  })
  onMount(() => void chat.sendMessage('go'))
  return (
    <EngineReachabilityContext.Provider value={{online: () => true, sustainedOffline: () => false}}>
      <ChatProvider chat={chat}>
        <ComposerHandlersProvider value={{}}>
          <PaneComposer
            draftStorage={memoryStorage()}
            draftKey="test"
            placeholder="Ask anything…"
            inputLabel="Message"
          />
        </ComposerHandlersProvider>
      </ChatProvider>
    </EngineReachabilityContext.Provider>
  )
}

describe('PaneComposer stop/send swap', () => {
  it('swaps the Send control for Stop while the run streams, and back to Send once it settles', async () => {
    render(() => <Harness />)
    const stop = page.getByRole('button', {name: 'Stop generating'})
    await expect.element(stop).toBeVisible()
    await expect.element(stop).toHaveTextContent('Stop')
    await userEvent.click(stop)
    const send = page.getByRole('button', {name: 'Send message'})
    await expect.element(send).toBeVisible()
    await expect.element(send).toHaveTextContent('Send')
  })
})
