import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {QueryClient, QueryClientProvider} from '@conciv/client'
import {AttachmentProvider, type CompleteAttachment} from '@conciv/ui-kit-chat'
import {type GrabPayload, GRAB_MIME} from '@conciv/grab/grab-attachment'
import {GrabCard} from './grab-card.js'

const STORY_FRAME_CLASS = 'p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

const meta: Meta = {title: 'Plugins/Page/tool/GrabCard'}
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
  rect: {x: 24, y: 96, width: 160, height: 48},
  preview: {
    kind: 'dom',
    html: '<button style="display:block;box-sizing:border-box;width:160px;height:48px;padding:8px 16px">Ship it</button>',
    width: 160,
    height: 48,
  },
}

export const GrabbedElement: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <QueryClientProvider client={new QueryClient()}>
        <AttachmentProvider value={grabAttachment('g1', DOM_PAYLOAD)}>
          <GrabCard />
        </AttachmentProvider>
      </QueryClientProvider>
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
      <QueryClientProvider client={new QueryClient()}>
        <AttachmentProvider value={UNPARSEABLE_PAYLOAD}>
          <GrabCard />
        </AttachmentProvider>
      </QueryClientProvider>
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('Grabbed element could not be read')).toBeVisible())
  },
}
