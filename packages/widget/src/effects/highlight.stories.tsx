import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, fireEvent, waitFor, within} from 'storybook/test'
import {createSignal} from 'solid-js'
import {highlightEffect} from './highlight.js'
import type {EffectCtx} from '@mandarax/extensions'

// Seam ctx: no backend. elementAt mirrors the real toggle-capture-then-elementFromPoint behaviour so
// the inspector resolves the page element under the cursor (the capture layer would otherwise win).
function makeSeam(onOpen: (file: string) => void): EffectCtx {
  return {
    page: {
      elementAt: (x, y) => {
        const cap = document.querySelector<HTMLElement>('[data-mandarax-capture]')
        const prev = cap?.style.pointerEvents
        if (cap) cap.style.pointerEvents = 'none'
        const el = document.elementFromPoint(x, y)
        if (cap) cap.style.pointerEvents = prev ?? ''
        return el
      },
      componentHostAt: (el) => el.closest('[data-fake]'),
      describe: () => ({component: 'Foo', file: '/src/Foo.tsx'}),
      locate: async () => ({
        component: 'Foo',
        stack: [],
        frames: [],
        owners: [],
        source: {file: '/src/Foo.tsx', line: 12, column: 3},
      }),
      inspect: async () => null,
      tree: async () => ({nodes: [], truncated: 0}),
      find: () => ({matches: [], total: 0}),
      addRef: () => 'r0',
    },
    openSource: async (loc) => {
      if (loc.source) onOpen(loc.source.file)
      return 'opened'
    },
    toast: () => {},
    env: {reducedMotion: () => true, doc: document, win: window},
    disable: () => {},
  }
}

function Harness() {
  const [opened, setOpened] = createSignal('')
  const ctx = makeSeam(setOpened)
  return (
    <div>
      <button
        data-mandarax-source="/src/Foo.tsx:12:3"
        type="button"
        style={{position: 'fixed', top: '140px', left: '160px', width: '140px', height: '44px'}}
      >
        Click me
      </button>
      <span data-testid="opened">{opened()}</span>
      {highlightEffect.render(ctx)}
    </div>
  )
}

const meta: Meta = {title: 'widget/HighlightEffect'}
export default meta
type Story = StoryObj

export const HoverAndClick: Story = {
  render: () => <Harness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const target = c.getByRole('button', {name: 'Click me'})
    const rect = target.getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2
    await fireEvent.pointerMove(target, {clientX, clientY, bubbles: true})
    await c.findByText('/src/Foo.tsx')
    await fireEvent.click(target, {clientX, clientY, bubbles: true})
    await waitFor(() => expect(c.getByTestId('opened')).toHaveTextContent('/src/Foo.tsx'))
  },
}
