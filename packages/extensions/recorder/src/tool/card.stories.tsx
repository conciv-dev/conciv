import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Trace, ToolTraceRow} from '@conciv/ui-kit-chat/tools'

import {RecordingToolCard} from './card.js'
import {pullToolClient, startToolClient, stopToolClient} from './client.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Recorder/tool/RecordingToolCard'}
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

const recorderTools = [
  {names: [startToolClient.name, stopToolClient.name, pullToolClient.name], render: RecordingToolCard},
]

function embeddedGallery(
  summary: string,
  part: ReturnType<typeof storyPart>,
  result: ReturnType<typeof storyResult> | undefined,
): JSX.Element {
  return (
    <div class="chat-theme-terminal p-4 w-[28rem] [background:var(--chat-panel)] [font-family:var(--chat-font)]">
      <Trace
        summary={summary}
        compactLine={summary}
        defaultOpen
        items={[
          {
            key: 'recording',
            render: (branch) => (
              <ToolTraceRow
                part={part}
                result={result}
                ctx={storyCtx({})}
                tools={() => recorderTools}
                last={branch.last}
                ring={branch.ring}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

export const EmbeddedInTrace: Story = {
  render: () =>
    embeddedGallery(
      '1 recording',
      storyPart('recording_pull', {secondsBack: 30, keyframes: 3}),
      storyResult([
        {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
        {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
        {type: 'text', content: LOG},
      ]),
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('pull')).toBeVisible()
    await expect(canvas.getByText('recording_pull')).toBeVisible()
    await expect(canvas.getByText('last 30s · 3 actions · 2 keyframes')).toBeVisible()
  },
}

export const EmbeddedError: Story = {
  render: () =>
    embeddedGallery(
      '1 failed',
      storyPart('recording_stop', {captureId: 'cap_9', keyframes: 0}),
      storyResult({error: 'no active capture cap_9'}),
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('no active capture cap_9')).toBeVisible())
  },
}
