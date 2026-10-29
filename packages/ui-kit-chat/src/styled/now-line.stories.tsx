import {createSignal, type JSX} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {NowLine} from './now-line.js'

const meta: Meta = {title: 'ui-kit-chat/styled/NowLine'}
export default meta
type Story = StoryObj

const FIRST_TITLE = 'Thinking…'
const SWAP_TITLES = [FIRST_TITLE, 'Reading widget-shell.tsx', 'Running pnpm test', 'Responding…']
const SWAP_MS = 1600
const CHURN_MS = 90

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[24rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

export const Running: Story = {
  render: () => frame(<NowLine title="Running pnpm test" onStop={() => {}} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('Running pnpm test')).toBeVisible())
    const stop = canvas.getByRole('button', {name: 'Stop generating'})
    await waitFor(() => expect(stop).toBeVisible())
    await userEvent.hover(stop)
  },
}

export const NoStop: Story = {
  render: () => frame(<NowLine title="Reading widget-shell.tsx" />),
}

function Cycling(props: {everyMs: number}): JSX.Element {
  const [index, setIndex] = createSignal(0)
  createTimer(
    () => setIndex((value) => (value + 1) % SWAP_TITLES.length),
    () => props.everyMs,
    setInterval,
  )
  return frame(<NowLine title={SWAP_TITLES[index()] ?? FIRST_TITLE} />)
}

export const SwappingActivity: Story = {
  render: () => <Cycling everyMs={SWAP_MS} />,
}

export const ChurningActivity: Story = {
  name: 'Churning activity (faster than the swap animation)',
  render: () => <Cycling everyMs={CHURN_MS} />,
}
