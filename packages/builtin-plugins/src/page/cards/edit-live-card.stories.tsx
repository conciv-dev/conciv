import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
  ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
} from '@conciv/ui-kit-chat/tools'
import {STORY_FRAME_CLASS, StoryTool, storyCall} from './story.fixtures.js'
import {traceGallery, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/EditLiveCard'}
export default meta
type Story = StoryObj

export const TextChangeWithDiff: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall('page_settext', {selector: '#cta', text: 'Order placed'}, {ok: true})}
        captures={{
          s1: {
            before: ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
            after: ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
            css: ELEMENT_CAPTURE_FIXTURE_CSS,
          },
        }}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Set the text')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tab', {name: 'Before'})).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('tab', {name: 'After'})).toBeVisible())
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('Order placed'),
    )
    await userEvent.click(canvas.getByRole('tab', {name: 'Before'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Submit order'})).toBeVisible())
    await userEvent.click(canvas.getByRole('tab', {name: 'After'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Order placed'})).toBeVisible())
    await userEvent.click(canvas.getByRole('tab', {name: 'Before'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Submit order'})).toBeVisible())
  },
}

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
