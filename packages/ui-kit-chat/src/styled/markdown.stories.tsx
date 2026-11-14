import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {Markdown, MarkdownProvider} from './markdown.js'

const meta: Meta = {title: 'ui-kit-chat/styled/Markdown'}
export default meta
type Story = StoryObj

const RAMP = [
  '## Scaffolded the panel',
  '',
  'It was scaling by a cached ratio. I now read `devicePixelRatio` on every resize and reset the transform before each paint, so it stays **sharp at 1x, 2x and fractional** scaling.',
  '',
  '### Files it touched',
  '',
  '- `FrameBackdrop.tsx` keeps the existing theme override',
  '- `PigCanvas.tsx` is a **standalone** component',
].join('\n')

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="p-4 w-[26rem] [background:var(--chat-bg)] [color:var(--chat-text)] [font-family:var(--chat-font)]">
      {child}
    </div>
  )
}

export const ProseRamp: Story = {
  render: () => frame(<Markdown content={RAMP} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('heading', {name: 'Scaffolded the panel'})).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('heading', {name: 'Files it touched'})).toBeVisible())
    await waitFor(() => expect(canvas.getByText('devicePixelRatio')).toBeVisible())
  },
}

const PROVIDED = [
  'The chart reads `src/sales.ts`.',
  '',
  '```chart',
  'sales by month',
  '```',
  '',
  '```chart',
  'a chart the provider declines',
  '```',
].join('\n')

const chartBlocks = {
  current: () => ({render: new Set(['chart']), actions: new Set<string>()}),
  render: (target: HTMLElement, block: {code: string}) => {
    if (block.code !== 'sales by month') return undefined
    const figure = document.createElement('figure')
    figure.setAttribute('aria-label', 'Chart')
    figure.textContent = `Chart of ${block.code}`
    target.append(figure)
    return () => figure.remove()
  },
  actions: () => [],
}

function ProvidedDemo(): JSX.Element {
  const [opened, setOpened] = createSignal('Nothing opened')
  return frame(
    <MarkdownProvider
      openLocalFile={(path) => setOpened(`Opened ${path}`)}
      localFileExists={(path) => path === 'src/sales.ts'}
      codeBlocks={chartBlocks}
    >
      <Markdown content={PROVIDED} />
      <output aria-label="Opened file">{opened()}</output>
    </MarkdownProvider>,
  )
}

export const WithProvider: Story = {
  render: () => <ProvidedDemo />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('figure', {name: 'Chart'})).toHaveTextContent('Chart of sales by month'),
    )
    await waitFor(() => expect(canvas.getByText('a chart the provider declines')).toBeVisible())
    await userEvent.click(canvas.getByRole('link', {name: 'src/sales.ts'}))
    await expect(canvas.getByRole('status', {name: 'Opened file'})).toHaveTextContent('Opened src/sales.ts')
  },
}
