import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {storyErrorResult, storyPart, storyResult} from '../page/cards/story.fixtures.js'
import {traceGallery, traceRow} from '../page/cards/trace.fixtures.js'
import {anchorCard} from './anchor-card.js'
import {whiteboardCards} from './cards.js'

const entry: ToolCardEntry = {
  names: Object.entries(whiteboardCards).flatMap(([name, card]) => (card === anchorCard ? [name] : [])),
  ...anchorCard,
}

const meta: Meta = {title: 'Plugins/Whiteboard/tool/AnchorResolveCard'}
export default meta
type Story = StoryObj

export const Fresh: Story = {
  render: () =>
    traceGallery('1 resolve', [
      traceRow(entry, storyPart('whiteboard_anchor_resolve', {cid: 'c_1'}), storyResult({status: 'fresh'})),
    ]),
}

export const Drifted: Story = {
  render: () =>
    traceGallery('1 resolve', [
      traceRow(
        entry,
        storyPart('whiteboard_anchor_resolve', {cid: 'c_2'}),
        storyResult({
          status: 'drifted',
          diff: {before: 'export function SessionPanel() {', after: 'export function SessionPanel(props) {'},
        }),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceGallery('1 failed', [
      traceRow(entry, storyPart('whiteboard_anchor_resolve', {cid: 'c_9'}), storyErrorResult('comment c_9 not found')),
    ]),
}
