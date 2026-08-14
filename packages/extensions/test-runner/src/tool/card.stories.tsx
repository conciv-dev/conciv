import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {HostApiProvider} from '@conciv/extension/host'
import {TestCard} from './card.js'
import {
  FAILING_RUN,
  PASSING_RUN,
  STORY_FRAME_CLASS,
  storyAddResult,
  storyCtx,
  storyPart,
  storyResult,
} from './story.fixtures.js'

const meta: Meta = {title: 'extension-test-runner/tool/TestCard'}
export default meta
type Story = StoryObj

function StoryFrame(props: {children: JSX.Element}): JSX.Element {
  return (
    <div class={STORY_FRAME_CLASS}>
      <HostApiProvider openEditor={() => {}}>{props.children}</HostApiProvider>
    </div>
  )
}

export const Passing: Story = {
  render: () => (
    <StoryFrame>
      <TestCard part={storyPart()} result={storyResult(PASSING_RUN)} ctx={storyCtx()} addResult={storyAddResult} />
    </StoryFrame>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('3 passed')).toBeVisible()
    await expect(canvas.getByText('adds two numbers')).toBeVisible()
  },
}

export const Failing: Story = {
  render: () => (
    <StoryFrame>
      <TestCard part={storyPart()} result={storyResult(FAILING_RUN)} ctx={storyCtx()} addResult={storyAddResult} />
    </StoryFrame>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1 failed')).toBeVisible()
  },
}

export const FailureExpanded: Story = {
  render: () => (
    <StoryFrame>
      <TestCard part={storyPart()} result={storyResult(FAILING_RUN)} ctx={storyCtx()} addResult={storyAddResult} />
    </StoryFrame>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: /applies the bulk discount/}))
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Fix this'})).toBeVisible())
  },
}

export const Running: Story = {
  render: () => (
    <StoryFrame>
      <TestCard part={storyPart('input-complete')} result={undefined} ctx={storyCtx()} addResult={storyAddResult} />
    </StoryFrame>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('running')).toBeVisible())
  },
}
