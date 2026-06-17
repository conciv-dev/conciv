import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {PageActionCard} from './page-action.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof PageActionCard> = {title: 'tool-ui/PageAction', component: PageActionCard}
export default meta
type Story = StoryObj<typeof PageActionCard>

export const Click: Story = {
  args: {
    part: callPart({name: 'aidx_page', input: {verb: 'click', selector: 'button.save'}}),
    result: resultPart('{"ok":true}'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Clicked button.save')).toBeInTheDocument()
  },
}

export const Fill: Story = {
  args: {
    part: callPart({name: 'aidx_page', input: {verb: 'fill', selector: '#name', value: 'Ada'}}),
    result: resultPart('{"ok":true}'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Typed "Ada" into #name')).toBeInTheDocument()
  },
}

export const Errored: Story = {
  args: {
    part: callPart({name: 'aidx_page', input: {verb: 'click', selector: '.missing'}}),
    result: resultPart('{"error":"no element"}', {state: 'error', error: 'no element matched .missing'}),
    ctx: noopCtx(),
  },
}
