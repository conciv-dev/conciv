import {createSignal, For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ComposerHandlersProvider} from '../composer/composer-handlers.js'
import {QueueItem, QueueItemProvider, type QueuedMessage} from './queue-item.js'

const meta: Meta = {title: 'primitives/QueueItem'}
export default meta
type Story = StoryObj

function Queue(props: {withHandlers: boolean}): JSX.Element {
  const [queue, setQueue] = createSignal<QueuedMessage[]>([
    {id: 'q1', text: 'also add a test'},
    {id: 'q2', text: 'and update the docs'},
  ])
  const handlers = props.withHandlers
    ? {
        queue,
        removeQueued: (id: string) => setQueue((prev) => prev.filter((item) => item.id !== id)),
        steerQueued: () => {},
      }
    : {}
  return (
    <ComposerHandlersProvider value={handlers}>
      <div class="flex flex-col gap-1">
        <For each={queue()}>
          {(item) => (
            <QueueItemProvider value={item}>
              <div class="text-[0.75rem] text-pw-text-2 flex gap-2 items-center">
                <QueueItem.Text class="flex-1" />
                <QueueItem.Steer class="text-pw-text-3">Steer</QueueItem.Steer>
                <QueueItem.Remove class="text-pw-text-3">×</QueueItem.Remove>
              </div>
            </QueueItemProvider>
          )}
        </For>
      </div>
    </ComposerHandlersProvider>
  )
}

export const WithQueueHandlers: Story = {
  render: () => <Queue withHandlers />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('also add a test')).toBeVisible()
    await expect(c.getAllByRole('button', {name: 'Steer'}).length).toBe(2)
    const [firstRemove] = c.getAllByRole('button', {name: 'Remove from queue'})
    if (firstRemove) await userEvent.click(firstRemove)
    await waitFor(() => expect(c.queryByText('also add a test')).toBeNull())
  },
}

export const GatedWithoutHandlers: Story = {
  render: () => <Queue withHandlers={false} />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // Settle on the rendered queue row first; only then are the gated-null buttons a real assertion.
    await waitFor(() => expect(c.getByText('also add a test')).toBeVisible())
    await expect(c.queryByRole('button', {name: 'Steer'})).toBeNull()
    await expect(c.queryByRole('button', {name: 'Remove from queue'})).toBeNull()
  },
}
