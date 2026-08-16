import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {CanvasOpCard} from './card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResultParts} from '../story.fixtures.js'

const meta: Meta = {title: 'Extensions/Whiteboard/tool/canvas/CanvasOpCard'}
export default meta
type Story = StoryObj

const PREVIEW_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIADAMNMZzJyGsYXCHTzA2Zhr60Lj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA0kMiZS1pDTBAAAAAElFTkSuQmCC'

export const PreviewImage: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <CanvasOpCard
        part={storyPart('canvas.preview', {})}
        result={storyResultParts([
          {type: 'image', source: {type: 'data', value: PREVIEW_PNG, mimeType: 'image/png'}},
          {type: 'text', content: JSON.stringify({})},
        ])}
        ctx={storyCtx()}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'canvas preview'})).toBeVisible())
  },
}

export const DeleteConfirmed: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <CanvasOpCard
        part={storyPart('canvas.delete', {elementId: 'el_1'})}
        result={storyResultParts([{type: 'text', content: JSON.stringify({deleted: 'el_1'})}])}
        ctx={storyCtx()}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('delete el_1')).toBeVisible())
  },
}

export const RunningOp: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <CanvasOpCard
        part={storyPart('canvas.draw', {}, 'input-complete')}
        result={undefined}
        ctx={storyCtx()}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('draw')).toBeVisible())
  },
}
