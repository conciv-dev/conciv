import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {storyPart, storyResult} from '../page/cards/story.fixtures.js'
import {traceGallery, traceRow} from '../page/cards/trace.fixtures.js'
import {elementCard} from './element-card.js'
import {whiteboardCards} from './cards.js'

const entry: ToolCardEntry = {
  names: Object.entries(whiteboardCards).flatMap(([name, card]) => (card === elementCard ? [name] : [])),
  ...elementCard,
}

const meta: Meta = {title: 'Plugins/Whiteboard/tool/ElementReferenceCard'}
export default meta
type Story = StoryObj

export const Found: Story = {
  render: () =>
    traceGallery('1 reference', [
      traceRow(
        entry,
        storyPart('whiteboard_element_reference', {file: 'src/panel/session-panel.tsx', component: 'SessionPanel'}),
        storyResult({found: true, file: 'src/panel/session-panel.tsx', line: 42, column: 3}),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceGallery('1 reference', [
      traceRow(
        entry,
        storyPart('whiteboard_element_reference', {file: 'src/panel/session-panel.tsx', component: 'MissingWidget'}),
        storyResult({found: false}),
      ),
    ]),
}
