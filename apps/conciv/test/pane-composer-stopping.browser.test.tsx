import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {createMemo, createSignal, onMount, type JSX} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider, ComposerHandlersProvider, createTextChunks, storyConnection} from '@conciv/ui-kit-chat'
import type {RunClockSource} from '@conciv/protocol/run-types'
import {EngineReachabilityContext} from '../src/app/reachability.js'
import {PaneComposer} from '../src/pane/pane-composer.jsx'
import {memoryStorage} from './helpers/memory-storage.js'

function lifecycleSourceAt(phase: RunClockSource['lifecycle']['phase']): RunClockSource {
  return {
    lifecycle: {runId: 'run-1', phase, startedAt: 0, finishedAt: null, serverNow: 0, error: null},
    receivedAt: Date.now(),
  }
}

function Harness(props: {settle: (settle: () => void) => void}): JSX.Element {
  const chat = useChat({
    connection: storyConnection({chunks: createTextChunks('working on it'), runsUntilStopped: true}),
  })
  const [serverGenerating, setServerGenerating] = createSignal(true)
  const [runSource, setRunSource] = createSignal<RunClockSource | null>(null)
  const observed = {...chat, sessionGenerating: serverGenerating}
  const stopping = createMemo(() => runSource()?.lifecycle.phase === 'stopping')
  const stoppable = {
    ...observed,
    stopping,
    stop: () => {
      setRunSource(lifecycleSourceAt('stopping'))
      chat.stop()
    },
  }
  onMount(() => {
    void chat.sendMessage('go')
    props.settle(() => {
      setRunSource(lifecycleSourceAt('aborted'))
      setServerGenerating(false)
    })
  })
  return (
    <EngineReachabilityContext.Provider value={{online: () => true, sustainedOffline: () => false}}>
      <ChatProvider chat={stoppable}>
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

describe('PaneComposer stopping state', () => {
  it('shows a disabled Stopping control from the click until the server reports the run settled', async () => {
    const control = {settle: () => {}}
    render(() => <Harness settle={(settle) => void (control.settle = settle)} />)

    const stop = page.getByRole('button', {name: 'Stop generating'})
    await expect.element(stop).toBeEnabled()
    await expect.element(stop).toHaveTextContent('Stop')

    await userEvent.click(stop)

    const stopping = page.getByRole('button', {name: 'Stopping the run'})
    await expect.element(stopping).toBeVisible()
    await expect.element(stopping).toHaveTextContent('Stopping…')
    await expect.element(stopping).toBeDisabled()

    control.settle()

    const send = page.getByRole('button', {name: 'Send message'})
    await expect.element(send).toBeVisible()
    await expect.element(send).toHaveTextContent('Send')
  })
})
