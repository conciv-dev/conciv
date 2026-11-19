import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {storyCall} from '../page/cards/story.fixtures.js'
import {traceGallery} from '../page/cards/trace.fixtures.js'
import {whiteboardRow} from './story.fixtures.js'

const meta: Meta = {title: 'Plugins/Whiteboard/tool/ElementReferenceCard'}
export default meta
type Story = StoryObj

export const Found: Story = {
  render: () =>
    traceGallery('1 reference', [
      whiteboardRow(
        storyCall(
          'whiteboard_element_reference',
          {file: 'src/panel/session-panel.tsx', component: 'SessionPanel'},
          {found: true, file: 'src/panel/session-panel.tsx', line: 42, column: 3},
        ),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceGallery('1 reference', [
      whiteboardRow(
        storyCall(
          'whiteboard_element_reference',
          {file: 'src/panel/session-panel.tsx', component: 'MissingWidget'},
          {found: false},
        ),
      ),
    ]),
}
