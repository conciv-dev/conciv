import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {storyCall, storyFailedCall} from '../page/cards/story.fixtures.js'
import {traceGallery} from '../page/cards/trace.fixtures.js'
import {whiteboardRow} from './story.fixtures.js'

const meta: Meta = {title: 'Plugins/Whiteboard/tool/AnchorResolveCard'}
export default meta
type Story = StoryObj

export const Fresh: Story = {
  render: () =>
    traceGallery('1 resolve', [whiteboardRow(storyCall('whiteboard_anchor_resolve', {cid: 'c_1'}, {status: 'fresh'}))]),
}

export const Drifted: Story = {
  render: () =>
    traceGallery('1 resolve', [
      whiteboardRow(
        storyCall(
          'whiteboard_anchor_resolve',
          {cid: 'c_2'},
          {
            status: 'drifted',
            diff: {before: 'export function SessionPanel() {', after: 'export function SessionPanel(props) {'},
          },
        ),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceGallery('1 failed', [
      whiteboardRow(storyFailedCall('whiteboard_anchor_resolve', {cid: 'c_9'}, 'comment c_9 not found')),
    ]),
}
