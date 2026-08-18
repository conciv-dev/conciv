import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {onMount, type JSX} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider, createTextChunks, storyConnection} from '@conciv/ui-kit-chat'
import {QueueStrip} from '../src/pane/queue-strip.jsx'

function Harness(props: {count: number}): JSX.Element {
  const chat = useChat({
    connection: storyConnection({chunks: createTextChunks('working'), runsUntilStopped: true}),
    queue: {whenBusy: 'queue', drain: 'fifo'},
  })
  onMount(() => {
    void chat.sendMessage('active request')
    for (let index = 0; index < props.count; index += 1) void chat.sendMessage(`queued instruction ${index + 1}`)
  })
  return (
    <ChatProvider chat={chat}>
      <QueueStrip queue={chat.queue()} />
    </ChatProvider>
  )
}

describe('QueueStrip', () => {
  it('renders no rows when the queue is empty', () => {
    const host = render(() => <QueueStrip queue={[]} />).container
    expect(host.textContent).toBe('')
  })

  it('shows a row per queued message, in order, once the composer queues work', async () => {
    render(() => <Harness count={2} />)
    await expect.element(page.getByText('Queue', {exact: true})).toBeVisible()
    await expect.element(page.getByText('2 waiting · runs in order')).toBeVisible()
    await expect.element(page.getByText('queued instruction 1')).toBeVisible()
    await expect.element(page.getByText('queued instruction 2')).toBeVisible()
  })

  it('collapses beyond three rows into a "+N more" line', async () => {
    render(() => <Harness count={5} />)
    await expect.element(page.getByText('queued instruction 1')).toBeVisible()
    await expect.element(page.getByText('queued instruction 3')).toBeVisible()
    await expect.element(page.getByText('+2 more')).toBeVisible()
    expect(page.getByText('queued instruction 4').elements()).toHaveLength(0)
  })
})
