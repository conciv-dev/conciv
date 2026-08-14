import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
  ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
} from '@conciv/ui-kit-chat/tools'
import {EditLiveCard} from './edit-live-card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'extension-page/client/cards/EditLiveCard'}
export default meta
type Story = StoryObj

const settextMeta: ToolViewMeta = {
  summary: 'replace the text content of an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Setting text', done: 'Set the text'},
  mutating: true,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, ref: {type: 'string'}, name: {type: 'string'}, text: {type: 'string'}},
    required: ['text'],
  },
  outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}}},
}

const evalMeta: ToolViewMeta = {
  summary: 'run javascript in the page and return its result',
  category: 'edit-live',
  icon: 'script',
  label: {running: 'Running a script', done: 'Ran a script'},
  mutating: true,
  mirrors: false,
  inputSchema: {type: 'object', properties: {code: {type: 'string'}}, required: ['code']},
  outputSchema: {type: 'object', properties: {result: {}}},
}

export const TextChangeWithDiff: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <EditLiveCard
        part={storyPart('page.settext', {selector: '#cta', text: 'Order placed'})}
        result={storyResult({ok: true})}
        ctx={storyCtx({'page.settext': settextMeta})}
        addResult={storyAddResult}
        capture={{
          before: ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
          after: ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
          css: ELEMENT_CAPTURE_FIXTURE_CSS,
        }}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Set the text')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tab', {name: 'Before'})).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('tab', {name: 'After'})).toBeVisible())
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('Order placed'),
    )
    await userEvent.click(canvas.getByRole('tab', {name: 'Before'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Submit order'})).toBeVisible())
    await userEvent.click(canvas.getByRole('tab', {name: 'After'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Order placed'})).toBeVisible())
    await userEvent.click(canvas.getByRole('tab', {name: 'Before'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Submit order'})).toBeVisible())
  },
}

export const EvalCodeBlock: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <EditLiveCard
        part={storyPart('page.eval', {code: 'return document.title'})}
        result={storyResult({result: 'Storefront'})}
        ctx={storyCtx({'page.eval': evalMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ran a script')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('document.title'),
    )
    await expect(canvas.queryByText('return document.title')).toBeNull()
  },
}
