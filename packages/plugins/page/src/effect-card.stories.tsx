import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {STORY_FRAME_CLASS, storyCall, StoryTool, traceGallery, traceRow, inPageShell} from './story.fixtures.js'

const meta: Meta = {title: 'Plugins/Page/tool/EffectCard', decorators: [inPageShell]}
export default meta
type Story = StoryObj

export const EffectTurnedOn: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_effect',
          {action: 'enable', effect: 'grid-overlay'},
          {effect: 'grid-overlay', enabled: true},
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Drove an effect')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('grid-overlay')).toBeVisible())
    await expect(canvas.getAllByText('grid-overlay')).toHaveLength(1)
    await waitFor(() => expect(canvas.getByText('action=enable')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('on')).toBeVisible())
  },
}

export const RegisteredEffects: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_effect',
          {action: 'list'},
          {
            effects: [
              {name: 'grid-overlay', description: 'draw the layout grid over the page', enabled: true},
              {name: 'focus-rings', description: 'highlight every focusable element', enabled: false},
            ],
          },
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('draw the layout grid over the page')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('off')).toBeVisible())
  },
}

export const NoEffects: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool call={storyCall('page_effect', {action: 'list'}, {effects: []})} />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('the page registered no effects')).toBeVisible())
  },
}

export const Trace: Story = {
  render: () =>
    traceGallery('1 effect', [
      traceRow(
        storyCall('page_effect', {action: 'enable', effect: 'grid-overlay'}, {effect: 'grid-overlay', enabled: true}),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Drove an effect')).toBeVisible()
    await expect(canvas.getAllByText('grid-overlay').length).toBeGreaterThan(0)
    await expect(canvas.getAllByText('on').length).toBeGreaterThan(0)
  },
}
