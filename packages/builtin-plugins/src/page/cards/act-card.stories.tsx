import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ELEMENT_CAPTURE_FIXTURE_CSS, ELEMENT_CAPTURE_FIXTURE_FULL} from '@conciv/ui-kit-chat/tools'
import {STORY_FRAME_CLASS, StoryTool, storyCall, storyFailedCall} from './story.fixtures.js'
import {traceGallery, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ActCard'}
export default meta
type Story = StoryObj

export const FilledField: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_fill',
          {selector: '#email', value: 'ada@example.com'},
          {ok: true, value: 'ada@example.com'},
        )}
        captures={{s1: {after: ELEMENT_CAPTURE_FIXTURE_FULL, css: ELEMENT_CAPTURE_FIXTURE_CSS}}}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Typed')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('value=ada@example.com')).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Email'})).toBeVisible())
  },
}

export const Trace: Story = {
  render: () =>
    traceGallery('3 actions', [
      traceRow(
        storyCall(
          'page_fill',
          {selector: '#email', value: 'ada@example.com'},
          {ok: true, value: 'ada@example.com'},
          't1',
        ),
      ),
      traceRow(storyCall('page_check', {selector: '#terms'}, {checked: true}, 't2')),
      traceRow(
        storyFailedCall('page_wait', {selector: '#done', state: 'visible'}, 'wait timed out for #done (visible)', 't3'),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Typed')).toBeVisible()
    await expect(canvas.getAllByText('#email').length).toBeGreaterThan(0)
    await expect(canvas.getByText(/timed out for #done/)).toBeVisible()
  },
}
