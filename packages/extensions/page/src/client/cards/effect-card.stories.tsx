import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {EffectCard} from './effect-card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/EffectCard'}
export default meta
type Story = StoryObj

const effectMeta: ToolViewMeta = {
  summary: 'enable, disable, toggle, report or list the visual effects the host page registered',
  category: 'act',
  icon: 'edit',
  label: {running: 'Driving an effect', done: 'Drove an effect'},
  mutating: true,
  mirrors: true,
  inputSchema: {
    type: 'object',
    properties: {action: {type: 'string'}, effect: {type: 'string'}},
    required: [],
  },
  outputSchema: {type: 'object', properties: {effect: {type: 'string'}, enabled: {type: 'boolean'}}},
}

export const EffectTurnedOn: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <EffectCard
        part={storyPart('page.effect', {action: 'enable', effect: 'grid-overlay'})}
        result={storyResult({effect: 'grid-overlay', enabled: true})}
        ctx={storyCtx({'page.effect': effectMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Drove an effect')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('grid-overlay')).toBeVisible())
    await expect(canvas.getAllByText('grid-overlay')).toHaveLength(1)
    await waitFor(() => expect(canvas.getByText('enable')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('on')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('shown on your page')).toBeVisible())
  },
}

export const RegisteredEffects: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <EffectCard
        part={storyPart('page.effect', {action: 'list'})}
        result={storyResult({
          effects: [
            {name: 'grid-overlay', description: 'draw the layout grid over the page', enabled: true},
            {name: 'focus-rings', description: 'highlight every focusable element', enabled: false},
          ],
        })}
        ctx={storyCtx({'page.effect': effectMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('draw the layout grid over the page')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('off')).toBeVisible())
  },
}

export const NoEffects: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <EffectCard
        part={storyPart('page.effect', {action: 'list'})}
        result={storyResult({effects: []})}
        ctx={storyCtx({'page.effect': effectMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('the page registered no effects')).toBeVisible())
  },
}
