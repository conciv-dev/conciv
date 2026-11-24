import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {STORY_FRAME_CLASS, storyCall, StoryTool, traceGallery, traceRow} from './story.fixtures.js'

const meta: Meta = {title: 'Plugins/Page/tool/EditLiveCard'}
export default meta
type Story = StoryObj

export const EvalCodeBlock: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool call={storyCall('page_eval', {code: 'return document.title'}, {result: 'Storefront'})} />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ran a script')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('document.title'),
    )
    await expect(canvas.queryByText('return document.title')).toBeNull()
  },
}

export const Trace: Story = {
  render: () =>
    traceGallery('2 edits', [
      traceRow(storyCall('page_setattr', {selector: '#cta', attribute: 'disabled', value: 'true'}, {ok: true}, 'e1')),
      traceRow(storyCall('page_eval', {code: 'return document.title'}, {result: 'Storefront'}, 'e2')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Set an attribute')).toBeVisible()
    await expect(canvas.getAllByText(/#cta/).length).toBeGreaterThan(0)
    await expect(canvas.getByText('Ran a script')).toBeVisible()
  },
}
