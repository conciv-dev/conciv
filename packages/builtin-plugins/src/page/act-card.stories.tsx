import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {storyCall, storyFailedCall, traceGallery, traceRow} from './story.fixtures.js'

const meta: Meta = {title: 'Plugins/Page/tool/ActCard'}
export default meta
type Story = StoryObj

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
