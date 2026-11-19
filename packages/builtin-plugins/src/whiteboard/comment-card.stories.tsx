import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {storyCall, storyFailedCall} from '../page/cards/story.fixtures.js'
import {traceGallery} from '../page/cards/trace.fixtures.js'
import {whiteboardRow} from './story.fixtures.js'

const meta: Meta = {title: 'Plugins/Whiteboard/tool/CommentOpCard'}
export default meta
type Story = StoryObj

const NOW = Date.UTC(2026, 7, 18, 14, 32)

export const CreatePreview: Story = {
  render: () =>
    traceGallery('1 comment', [
      whiteboardRow(
        storyCall(
          'whiteboard_comment_create',
          {
            cid: 'c_42',
            kind: 'source-linked',
            parts: [{type: 'text', text: 'This card overlaps the header on narrow widths.'}],
            x: 240,
            y: 120,
            elementId: 'el_9',
            authorKind: 'ai',
            authorModel: 'claude-sonnet-5',
          },
          {cid: 'c_42'},
        ),
      ),
    ]),
}

export const ListResults: Story = {
  render: () =>
    traceGallery('1 list', [
      whiteboardRow(
        storyCall(
          'whiteboard_comment_list',
          {scope: 'session'},
          {
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
          },
        ),
      ),
    ]),
}

export const ReadThread: Story = {
  render: () =>
    traceGallery('1 read', [
      whiteboardRow(
        storyCall(
          'whiteboard_comment_read',
          {cid: 'c_1'},
          {
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
          },
        ),
      ),
    ]),
}

export const ResolveConfirmed: Story = {
  render: () =>
    traceGallery('1 resolve', [
      whiteboardRow(storyCall('whiteboard_comment_resolve', {cid: 'c_1'}, {cid: 'c_1', status: 'resolved'})),
    ]),
}

export const DeleteConfirmed: Story = {
  render: () =>
    traceGallery('1 delete', [
      whiteboardRow(storyCall('whiteboard_comment_delete', {cid: 'c_42'}, {cid: 'c_42', deleted: true})),
    ]),
}

export const PinLocked: Story = {
  render: () =>
    traceGallery('1 pin', [
      whiteboardRow(
        storyCall('whiteboard_pin_set_state', {cid: 'c_42', pinState: 'locked'}, {cid: 'c_42', pinState: 'locked'}),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceGallery('1 failed', [
      whiteboardRow(storyFailedCall('whiteboard_comment_resolve', {cid: 'c_9'}, 'comment c_9 not found')),
    ]),
}
