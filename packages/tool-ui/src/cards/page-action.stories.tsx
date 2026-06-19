import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {PageActionCard} from './page-action.js'
import {callPart, resultPart, payloadResultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof PageActionCard> = {title: 'tool-ui/PageAction', component: PageActionCard}
export default meta
type Story = StoryObj<typeof PageActionCard>

export const Click: Story = {
  args: {
    part: callPart({name: 'mandarax_page', input: {verb: 'click', selector: 'button.save'}}),
    result: payloadResultPart({ok: true}),
    ctx: noopCtx(),
    durationMs: 420,
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Clicked button.save')).toBeInTheDocument()
    // Action verbs flag the on-page mirror and show the call's wall-clock as meta.
    await expect(c.getByText('shown on your page')).toBeVisible()
    await expect(c.getByText('0.4s')).toBeVisible()
  },
}

// A snapshot renders its accessibility nodes as a readable list — NOT the raw escaped MCP envelope.
export const Snapshot: Story = {
  args: {
    part: callPart({name: 'mandarax_page', input: {verb: 'snapshot'}}),
    result: payloadResultPart({
      nodes: [
        {ref: 'v1', role: 'navigation', name: 'Home'},
        {ref: 'v2', role: 'button', name: 'Get started'},
      ],
    }),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Captured a snapshot')).toBeInTheDocument()
    await expect(c.getByText('navigation')).toBeVisible()
    await expect(c.getByText('Get started')).toBeVisible()
    // The regression guard: the escaped envelope / raw JSON must NOT be on screen.
    await expect(c.queryByText(/"type":"text"/)).not.toBeInTheDocument()
    await expect(c.queryByText(/"nodes"/)).not.toBeInTheDocument()
  },
}

// A DOM read renders the HTML through the Pierre code block (Shiki-highlighted), not a JSON blob.
// Like FileRead's story, we assert the header + that the raw envelope isn't shown — the highlighted
// code body is tokenized async by Shiki and isn't reliably queryable by text.
export const Dom: Story = {
  args: {
    part: callPart({name: 'mandarax_page', input: {verb: 'dom'}}),
    // The real `dom` read returns body.outerHTML as one unbroken minified line; the card
    // pretty-prints it (js-beautify) before Pierre highlights, so it renders indented.
    result: payloadResultPart({
      html: '<main class="hero"><nav><a href="/">Home</a><button type="button">Menu</button></nav><h1>Title</h1><p>Drive your app by talking to it.</p></main>',
    }),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Read the DOM')).toBeInTheDocument()
    await expect(c.queryByText(/"html"/)).not.toBeInTheDocument()
  },
}

// A handler that returned {error} on a 'complete' result still shows the message, not raw JSON.
export const ResultError: Story = {
  args: {
    part: callPart({name: 'mandarax_page', input: {verb: 'text'}}),
    result: payloadResultPart({error: 'no target — pass --ref, --selector, or --name'}),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('no target — pass --ref, --selector, or --name')).toBeVisible()
    await expect(c.queryByText(/"error"/)).not.toBeInTheDocument()
  },
}

export const Errored: Story = {
  args: {
    part: callPart({name: 'mandarax_page', input: {verb: 'click', selector: '.missing'}}),
    result: resultPart('{"error":"no element"}', {state: 'error', error: 'no element matched .missing'}),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('no element matched .missing')).toBeVisible()
  },
}
