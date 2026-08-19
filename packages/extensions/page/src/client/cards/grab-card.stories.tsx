import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {AttachmentProvider} from '@conciv/ui-kit-chat'
import type {CompleteAttachment} from '@conciv/ui-kit-chat'
import type {GrabPayload} from '@conciv/grab/grab-attachment'
import {GRAB_MIME} from '@conciv/grab/grab-attachment'
import {GrabCard} from './grab-card.js'
import {STORY_FRAME_CLASS} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/GrabCard'}
export default meta
type Story = StoryObj

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  return btoa(String.fromCharCode(...bytes))
}

function grabAttachment(id: string, payload: GrabPayload): CompleteAttachment {
  return {
    id,
    type: 'document',
    name: 'Grabbed element',
    content: [
      {type: 'document', source: {type: 'data', value: encodeUtf8Base64(JSON.stringify(payload)), mimeType: GRAB_MIME}},
    ],
    status: {type: 'complete'},
  }
}

const DOM_PAYLOAD: GrabPayload = {
  text: '<button class="primary">Ship it</button>',
  snippet: undefined,
  source: {componentName: 'ShipButton', filePath: 'src/checkout/ship-button.tsx', lineNumber: 14},
  rect: {x: 24, y: 96, width: 120, height: 36},
  preview: {kind: 'dom', html: '<button style="padding:8px 16px">Ship it</button>', width: 160, height: 48},
}

export const GrabbedElement: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <AttachmentProvider value={grabAttachment('g1', DOM_PAYLOAD)}>
        <GrabCard />
      </AttachmentProvider>
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Open grabbed element'})).toBeVisible())
    await expect(canvas.getByText('ShipButton', {exact: false})).toBeVisible()
  },
}

const UNPARSEABLE_PAYLOAD: CompleteAttachment = {
  id: 'g2',
  type: 'document',
  name: 'Grabbed element',
  content: [{type: 'document', source: {type: 'data', value: encodeUtf8Base64('not json'), mimeType: GRAB_MIME}}],
  status: {type: 'complete'},
}

export const UnreadablePayload: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <AttachmentProvider value={UNPARSEABLE_PAYLOAD}>
        <GrabCard />
      </AttachmentProvider>
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('Grabbed element could not be read')).toBeVisible())
  },
}
