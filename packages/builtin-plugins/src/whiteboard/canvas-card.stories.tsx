import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {storyPart, storyResult} from '../page/cards/story.fixtures.js'
import {traceGallery, traceRow} from '../page/cards/trace.fixtures.js'
import {canvasCard} from './canvas-card.js'
import {whiteboardCards} from './cards.js'

const entry: ToolCardEntry = {
  names: Object.entries(whiteboardCards).flatMap(([name, card]) => (card === canvasCard ? [name] : [])),
  ...canvasCard,
}

const meta: Meta = {title: 'Plugins/Whiteboard/tool/CanvasOpCard'}
export default meta
type Story = StoryObj

const PREVIEW_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIADAMNMZzJyGsYXCHTzA2Zhr60Lj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA0kMiZS1pDTBAAAAAElFTkSuQmCC'

export const Read: Story = {
  render: () =>
    traceGallery('1 read', [
      traceRow(
        entry,
        storyPart('whiteboard_canvas_read', {scope: 'draft'}),
        storyResult({
          scope: 'draft',
          elements: [
            {type: 'rectangle', x: 20, y: 40, width: 120, height: 60},
            {type: 'rectangle', x: 180, y: 40, width: 120, height: 60},
            {type: 'text', x: 24, y: 48, width: 60, height: 20},
            {type: 'arrow', x: 140, y: 70, width: 40, height: 4},
          ],
        }),
      ),
    ]),
}

export const Svg: Story = {
  render: () =>
    traceGallery('1 draw', [
      traceRow(
        entry,
        storyPart('whiteboard_canvas_svg', {
          svg: '<path d="M10 10 L90 10 L50 90 Z" fill="#c9857f"/>',
          x: 0,
          y: 0,
          width: 100,
        }),
        storyResult({pending: 'p_1'}),
      ),
    ]),
}

export const Diagram: Story = {
  render: () =>
    traceGallery('1 draw', [
      traceRow(
        entry,
        storyPart('whiteboard_canvas_diagram', {mermaid: 'flowchart LR\n  Draft --> Preview --> Commit'}),
        storyResult({pending: 'p_2'}),
      ),
    ]),
}

export const PreviewImage: Story = {
  render: () =>
    traceGallery('1 preview', [
      traceRow(
        entry,
        storyPart('whiteboard_canvas_preview', {}),
        storyResult([
          {type: 'image', source: {type: 'data', value: PREVIEW_PNG, mimeType: 'image/png'}},
          {type: 'text', content: JSON.stringify({elements: 4})},
        ]),
      ),
    ]),
}

export const PreviewEmpty: Story = {
  render: () =>
    traceGallery('1 preview', [
      traceRow(
        entry,
        storyPart('whiteboard_canvas_preview', {}),
        storyResult({empty: true, reason: 'draft has no elements yet'}),
      ),
    ]),
}

export const DeleteConfirmed: Story = {
  render: () =>
    traceGallery('1 delete', [
      traceRow(entry, storyPart('whiteboard_canvas_delete', {elementId: 'el_1'}), storyResult({deleted: 'el_1'})),
    ]),
}

export const CommitFailed: Story = {
  render: () =>
    traceGallery('1 commit', [
      traceRow(
        entry,
        storyPart('whiteboard_canvas_commit', {}),
        storyResult({committed: false, reason: 'no draft to commit'}),
      ),
    ]),
}

export const ExportFailed: Story = {
  render: () =>
    traceGallery('1 failed', [
      traceRow(
        entry,
        storyPart('whiteboard_canvas_preview', {}),
        storyResult({error: 'preview render failed', reason: 'no renderer', elements: 4}),
      ),
    ]),
}

export const RunningOp: Story = {
  render: () =>
    traceGallery('1 running', [traceRow(entry, storyPart('whiteboard_canvas_draw', {}, 'input-complete'), undefined)]),
}
