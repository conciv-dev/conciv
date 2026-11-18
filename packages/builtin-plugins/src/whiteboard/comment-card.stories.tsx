import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {storyErrorResult, storyPart, storyResult} from '../page/cards/story.fixtures.js'
import {traceGallery, traceRow} from '../page/cards/trace.fixtures.js'
import {commentCard} from './comment-card.js'
import {whiteboardCards} from './cards.js'

const entry: ToolCardEntry = {
  names: Object.entries(whiteboardCards).flatMap(([name, card]) => (card === commentCard ? [name] : [])),
  ...commentCard,
}

const meta: Meta = {title: 'Plugins/Whiteboard/tool/CommentOpCard'}
export default meta
type Story = StoryObj

const NOW = Date.UTC(2026, 7, 18, 14, 32)

export const CreatePreview: Story = {
  render: () =>
    traceGallery('1 comment', [
      traceRow(
        entry,
        storyPart('whiteboard_comment_create', {
          cid: 'c_42',
          kind: 'source-linked',
          parts: [{type: 'text', text: 'This card overlaps the header on narrow widths.'}],
          x: 240,
          y: 120,
          elementId: 'el_9',
          authorKind: 'ai',
          authorModel: 'claude-sonnet-5',
        }),
        storyResult({cid: 'c_42'}),
      ),
    ]),
}

export const ListResults: Story = {
  render: () =>
    traceGallery('1 list', [
      traceRow(
        entry,
        storyPart('whiteboard_comment_list', {scope: 'session'}),
        storyResult({
          comments: [
            {
              cid: 'c_1',
              status: 'open',
              authorKind: 'human',
              parts: [{type: 'text', text: 'Can we widen the sidebar?'}],
              anchorComponent: 'SessionPanel',
              createdAt: NOW - 6 * 60_000,
            },
            {
              cid: 'c_2',
              status: 'resolved',
              authorKind: 'ai',
              authorModel: 'claude-sonnet-5',
              parts: [{type: 'text', text: 'Widened to 480px and re-checked the wrap.'}],
              anchorFile: 'src/panel/session-panel.tsx',
              createdAt: NOW - 4 * 60_000,
            },
          ],
        }),
      ),
    ]),
}

export const ReadThread: Story = {
  render: () =>
    traceGallery('1 read', [
      traceRow(
        entry,
        storyPart('whiteboard_comment_read', {cid: 'c_1'}),
        storyResult({
          comment: {
            cid: 'c_1',
            status: 'open',
            authorKind: 'human',
            parts: [{type: 'text', text: 'Can we widen the sidebar?'}],
            anchorComponent: 'SessionPanel',
            createdAt: NOW - 6 * 60_000,
          },
          replies: [
            {
              cid: 'c_1_r1',
              parentId: 'c_1',
              authorKind: 'ai',
              authorModel: 'claude-sonnet-5',
              parts: [{type: 'text', text: 'Widened to 480px and re-checked the wrap.'}],
              createdAt: NOW - 4 * 60_000,
            },
          ],
        }),
      ),
    ]),
}

export const ResolveConfirmed: Story = {
  render: () =>
    traceGallery('1 resolve', [
      traceRow(
        entry,
        storyPart('whiteboard_comment_resolve', {cid: 'c_1'}),
        storyResult({cid: 'c_1', status: 'resolved'}),
      ),
    ]),
}

export const DeleteConfirmed: Story = {
  render: () =>
    traceGallery('1 delete', [
      traceRow(entry, storyPart('whiteboard_comment_delete', {cid: 'c_42'}), storyResult({cid: 'c_42', deleted: true})),
    ]),
}

export const PinLocked: Story = {
  render: () =>
    traceGallery('1 pin', [
      traceRow(
        entry,
        storyPart('whiteboard_pin_set_state', {cid: 'c_42', pinState: 'locked'}),
        storyResult({cid: 'c_42', pinState: 'locked'}),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceGallery('1 failed', [
      traceRow(entry, storyPart('whiteboard_comment_resolve', {cid: 'c_9'}), storyErrorResult('comment c_9 not found')),
    ]),
}
