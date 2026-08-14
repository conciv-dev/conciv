import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {RecordingToolCard} from './card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'extension-recorder/tool/RecordingToolCard'}
export default meta
type Story = StoryObj

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const LOG = '+0.0s [click] button "Save"\n+2.5s [navigation] /settings\n+4.1s [console] error: boom'

export const Main: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <RecordingToolCard
        part={storyPart('recording_pull', {secondsBack: 30, keyframes: 3})}
        result={storyResult([
          {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
          {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
          {type: 'text', content: LOG},
        ])}
        ctx={storyCtx({})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('last 30s · 3 actions · 2 keyframes')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('button "Save"')).toBeVisible())
    await expect(canvas.getByText('navigation')).toBeVisible()
  },
}

export const ErrorState: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <RecordingToolCard
        part={storyPart('recording_stop', {captureId: 'cap_9', keyframes: 0})}
        result={storyResult({error: 'no active capture cap_9'})}
        ctx={storyCtx({})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('no active capture cap_9')).toBeVisible())
  },
}

export const Recording: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <RecordingToolCard
        part={storyPart('recording_pull', {secondsBack: 30}, 'input-complete')}
        result={undefined}
        ctx={storyCtx({})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('recording…')).toBeVisible())
  },
}
