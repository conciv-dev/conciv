import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {STORY_FRAME_CLASS, StoryTool, storyCall} from './story.fixtures.js'
import {traceGallery, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Plugins/Page/tool/ReadBulkCard'}
export default meta
type Story = StoryObj

function shadowText(canvasElement: HTMLElement): string {
  return Array.from(canvasElement.querySelectorAll('diffs-container'))
    .map((host) => host.shadowRoot?.textContent ?? '')
    .join('\n')
}

export const DomMarkup: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_dom',
          {selector: '#hero'},
          {html: '<section id="hero"><h1>Ship it on Friday</h1></section>'},
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the DOM')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('#hero')).toBeVisible())
    await waitFor(() => expect(shadowText(canvasElement)).toContain('Ship it on Friday'))
  },
}

export const SnapshotNodes: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_snapshot',
          {selector: 'form'},
          {
            nodes: [
              {ref: 'e12', role: 'textbox', name: 'Email'},
              {ref: 'e13', role: 'button', name: 'Ship it'},
            ],
          },
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('Ship it')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('e12')).toBeVisible())
  },
}

export const QueryMatches: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_query',
          {selector: 'button.primary'},
          {
            count: 3,
            elements: [{tagName: 'button', className: 'primary'}, {tagName: 'button'}, {tagName: 'button'}],
          },
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('3 matches')).toBeVisible())
  },
}

export const EmptySnapshot: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool call={storyCall('page_snapshot', {selector: '#empty'}, {nodes: []})} />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('the snapshot found no accessible nodes')).toBeVisible())
  },
}

export const Trace: Story = {
  render: () =>
    traceGallery('1 snap', [
      traceRow(
        storyCall(
          'page_snapshot',
          {selector: 'form'},
          {
            nodes: [
              {ref: 'e12', role: 'textbox', name: 'Email'},
              {ref: 'e13', role: 'button', name: 'Ship it'},
            ],
          },
        ),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Captured a snapshot')).toBeVisible()
    await expect(canvas.getAllByText('form').length).toBeGreaterThan(0)
    await waitFor(() => expect(canvas.getByText('Email')).toBeVisible())
    await expect(canvas.getByText('Ship it')).toBeVisible()
  },
}
