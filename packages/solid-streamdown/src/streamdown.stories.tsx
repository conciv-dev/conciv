import {createEffect, createSignal, onCleanup} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within} from 'storybook/test'
import {Streamdown, type CaretVariant, type HighlightCode} from './streamdown.js'

// A throwaway highlighter for the stories: escape + wrap. The widget plugs its real shiki into this
// exact slot (the `highlightCode` prop) — the point here is to show the code-block override works.
const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const demoHighlight: HighlightCode = (code, lang) =>
  `<pre class="sd-demo-code" data-lang="${lang ?? ''}"><code>${escapeHtml(code)}</code></pre>`

const SAMPLE = `# Streaming Markdown

This is **streamdown**, ported to Solid. It renders *incrementally* with a token fade-in.

- block-memoized rendering
- incomplete-markdown handling
- per-token animation

\`\`\`ts
function greet(name: string) {
  return \`hello \${name}\`
}
\`\`\`

> Only the growing last block re-parses per token.

| feature | status |
| --- | --- |
| blocks | done |
| animated | done |
`

const COMPLEX_SAMPLE = `
# Complex Markdown Test

## Lists and Nesting
- Level 1
  - Level 2
    - Level 3 with **bold** and *italic*
- Level 1 again
  1. Ordered item
  2. Another ordered item

## Tables
| Feature | Description | Status |
| :--- | :--- | :---: |
| Animation | Smooth token fade-in | 🟢 |
| Stability | No DOM thrashing | 🟢 |
| Caret | Steady baseline cursor | 🟢 |

## Blockquotes
> This is a blockquote.
> It can span multiple lines.
>> Even nested blockquotes should work.

## Code Blocks
\`\`\`ts
interface User {
  id: string;
  name: string;
}

function logUser(user: User) {
  console.log(\`User: \${user.name} (\${user.id})\`);
}
\`\`\`

## Links and Images
[Google](https://google.com)
![Placeholder](https://via.placeholder.com/150)
`

// Streams SAMPLE in one character-chunk at a time so the fade-in is visible in the Storybook canvas.
function StreamingDemo(props: {
  full: string
  animated: boolean
  caret?: CaretVariant
  highlightCode?: HighlightCode
  speed?: number
}): ReturnType<typeof Streamdown> {
  const [shown, setShown] = createSignal('')
  const [done, setDone] = createSignal(false)
  createEffect(() => {
    const full = props.full
    setShown('')
    setDone(false)
    let i = 0
    const step = Math.max(1, Math.round(full.length / 150)) // Slower for complex
    const id = setInterval(() => {
      i += step
      setShown(full.slice(0, i))
      if (i >= full.length) {
        setShown(full) // Ensure final state is exact
        clearInterval(id)
        setDone(true)
      }
    }, props.speed ?? 50)
    onCleanup(() => clearInterval(id))
  })
  return (
    <Streamdown
      animated={props.animated}
      isAnimating={!done()}
      caret={done() ? false : (props.caret ?? 'block')}
      highlightCode={props.highlightCode}
    >
      {shown()}
    </Streamdown>
  )
}

const meta = {
  title: 'Streamdown',
  component: Streamdown,
  args: {children: SAMPLE, animated: true},
  parameters: {layout: 'padded'},
} satisfies Meta<typeof Streamdown>

export default meta
type Story = StoryObj<typeof meta>

// Fully-rendered (no streaming): proves the markdown surface — headings, lists, code, tables.
export const Static: Story = {
  render: (args) => (
    <Streamdown animated={false} highlightCode={demoHighlight}>
      {args.children}
    </Streamdown>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    // Use regex to match text that might be split across spans
    await expect(canvas.getByText(/Streaming Markdown/)).toBeInTheDocument()
    await expect(canvas.getByText(/block-memoized rendering/)).toBeInTheDocument()
    await expect(canvasElement.querySelector('table')).toBeTruthy()
    await expect(canvasElement.querySelector('.sd-demo-code')).toBeTruthy()
  },
}

// Streams token-by-token with a block caret; watch the fade-in. (Flicker suppression is covered
// deterministically by the animate-plugin unit test.)
export const Streaming: Story = {
  render: (args) => (
    <StreamingDemo full={args.children} animated={args.animated ?? true} caret="block" highlightCode={demoHighlight} />
  ),
  play: async ({canvasElement}) => {
    // Animation on splits text into per-word spans, so assert against reconstructed textContent.
    await waitFor(() => expect(canvasElement.querySelector('[data-sd-animate]')).toBeTruthy(), {timeout: 4000})
    await waitFor(() => expect(canvasElement.textContent).toContain('Streaming Markdown'), {timeout: 10_000})
    await waitFor(() => expect(canvasElement.textContent).toContain('per-token animation'), {timeout: 10_000})
  },
}

export const ComplexStreaming: Story = {
  render: (args) => (
    <StreamingDemo
      full={COMPLEX_SAMPLE}
      animated={args.animated ?? true}
      caret="block"
      highlightCode={demoHighlight}
      speed={30}
    />
  ),
}

// Frozen mid-stream (isAnimating, never completes) with an earlier complete block + an hr + the
// growing block. Proves the caret renders on the LAST block's ::after only — never on earlier blocks.
// Guards against the recursive-::after regression that put a caret on every block's last leaf.
export const CaretPlacement: Story = {
  render: () => (
    <Streamdown isAnimating caret="block" highlightCode={demoHighlight}>
      {'First paragraph, complete.\n\n---\n\nSecond paragraph still streaming'}
    </Streamdown>
  ),
  play: async ({canvasElement}) => {
    const root = canvasElement.querySelector('.sd-root') as HTMLElement
    await waitFor(() => expect(root).toBeTruthy(), {timeout: 4000})
    // The caret var rides the root.
    await waitFor(() => expect(getComputedStyle(root).getPropertyValue('--sd-caret')).toContain('▋'), {timeout: 4000})
    const blocks = root.querySelectorAll(':scope > *')
    const lastBlock = blocks[blocks.length - 1] as HTMLElement
    // Caret renders on the LAST block's ::after, and the last block is the streaming paragraph.
    await expect(getComputedStyle(lastBlock, '::after').content).toContain('▋')
    await expect(lastBlock.textContent).toContain('Second paragraph')
    // No caret on the earlier, completed block.
    await expect(getComputedStyle(blocks[0] as HTMLElement, '::after').content).not.toContain('▋')
  },
}

// The exact TEXT_MESSAGE_CONTENT deltas captured from a real conciv run that mis-rendered the caret.
// The widget accumulates deltas and passes the growing string to <Markdown> each token, so we do the same.
const WIDGET_DELTAS = [
  'Another long prose passage, no code.\n\n---\n\nIt occurs to me that what we are doing,',
  ' in the most literal sense, is filling a vessel and watching the level rise, and there',
  ' is something almost contemplative in that. A vessel with no bottom would teach you',
  ' nothing; it is precisely because the capacity is finite that the filling becomes informative. You lear',
  'n the size of a thing by reaching its edges. The same is true of attention, of mem',
  'ory, of a working context: you do not really know its sh',
  'ape until you press against its limits and feel where they are. This test, rep',
  'etitive as it looks, is a way of mapping a boundary, and mapping bo',
  'undaries is one of the oldest and most useful things an engineer can do. You cannot reason well about a system whose limits you have never found',
  '.\n\nThere is a reason that so many durable ideas in software come back to the management',
  ' of scarcity. Memory is scarce, so we cache and evict.',
  ' Attention is scarce, so we summarize and prioritize. Time is scarce, so we parallelize and defer. Even',
  ' trust is scarce, spent a little with every claim and replenished sl',
  'owly by every claim that proves true. The whole discipline can be read as a long',
  ' negotiation with limits that will not move, an endless search',
  ' for arrangements that get the most value from resources that refuse to grow. The eng',
  'ineer who pretends the limits are not there builds systems that work be',
  'autifully in the demo and collapse under load. The one who designs around the limits builds things that endure.\n\nAnd yet sc',
  'arcity is not only a constraint; it is also what gives choices meaning. If',
  ' memory were infinite there would be no reason to decide what matters, because everything could',
  ' be kept with equal weight, and a world where everything is kept is a world where nothing is found. The act',
  ' of choosing what to hold close and what to let fade is the act that turns raw cap',
  'acity into actual intelligence. A library is not made use',
  'ful by owning every book ever printed; it is made useful by its catalogue, its arrang',
  'ement, its decisions about what to put within reach. Curation is the value.',
  ' The same is true of a context window, of a codebase, of a working memory: the disc',
  'ipline of leaving things out is what makes the things left in legible.\n\nThis',
  ' is why the small habits matter so much more than they appear to. Grounding before ac',
  'ting, reading before writing, verifying before declaring, touching only what was asked. None',
  ' makes for a good story. But they compound, the way small de',
  'posits compound, until the difference between the engineer who practices them and the one who does not is not a mat',
  'ter of talent but of accumulated reliability. People trust the careful one not because they are br',
  'illiant but because, over a long series of small moments, they were honest, and rest',
  'rained, and right. Reputation in this work is just the integ',
  'ral of many tiny acts of discipline, summed over time.\n\nSo I add this passage to',
  ' the pile, another increment toward the level you are watching climb, and I remain ready to add',
  ' more. The themes are deep enough to sustain a great deal more circling without true repetition, because the',
  ' questions of limits and trust and attention do not have bottoms either. If it',
  ' is sheer volume you need, I will switch to literal lorem ipsum without compla',
  'int. If the measurement is finished, I will go quiet and clipped and wait for the real work',
  '. And if you simply want to keep watching the meter rise, say the word once more and the',
  ' next passage will follow this one exactly as this one followed the last.',
]

// Replays WIDGET_DELTAS exactly like the widget: accumulate deltas, pass the growing string each token.
function WidgetReplay(props: {stopAt?: number; speed?: number}): ReturnType<typeof Streamdown> {
  const [text, setText] = createSignal('')
  const [done, setDone] = createSignal(false)
  createEffect(() => {
    const stopAt = props.stopAt ?? WIDGET_DELTAS.length
    let acc = ''
    let i = 0
    const id = setInterval(() => {
      acc += WIDGET_DELTAS[i] ?? ''
      setText(acc)
      i += 1
      if (i >= stopAt) {
        clearInterval(id)
        if (stopAt >= WIDGET_DELTAS.length) setDone(true)
      }
    }, props.speed ?? 120)
    onCleanup(() => clearInterval(id))
  })
  return (
    <Streamdown isAnimating={!done()} caret={done() ? false : 'block'} highlightCode={demoHighlight}>
      {text()}
    </Streamdown>
  )
}

// The full real-stream replay. Watch the caret as tokens land — it must stay inline at the end of the
// last paragraph, never detach onto its own line.
export const WidgetStream: Story = {
  render: () => <WidgetReplay />,
}

// Frozen at the exact first-delta state from the bug report (image #20): para + hr + a partial paragraph.
// Asserts the caret renders inline on the LAST block (the streaming paragraph), not detached/elsewhere.
export const WidgetStreamFrozen: Story = {
  render: () => (
    <Streamdown isAnimating caret="block" highlightCode={demoHighlight}>
      {WIDGET_DELTAS[0] ?? ''}
    </Streamdown>
  ),
  play: async ({canvasElement}) => {
    const root = canvasElement.querySelector('.sd-root') as HTMLElement
    await waitFor(() => expect(root.textContent).toContain('doing'), {timeout: 4000})
    // No stagger by default → tokens fade uniformly, never sequentially, so the caret never floats
    // over an empty gap of still-invisible trailing tokens (the bug from image #20).
    const delays = Array.from(root.querySelectorAll('[data-sd-animate]')).map((s) =>
      Number(/--sd-delay:(\d+)ms/.exec((s as HTMLElement).getAttribute('style') ?? '')?.[1] ?? '0'),
    )
    await expect(Math.max(...delays, 0)).toBe(0)
    // Caret renders inline on the LAST block (the streaming paragraph), never detached or elsewhere.
    const blocks = Array.from(root.querySelectorAll(':scope > *')) as HTMLElement[]
    const last = blocks.at(-1)!
    await expect(getComputedStyle(last, '::after').content).toContain('▋')
    await expect(last.textContent).toContain('It occurs to me')
  },
}

// Circle caret variant.
export const CaretCircle: Story = {
  render: (args) => (
    <StreamingDemo full={args.children} animated={args.animated ?? true} caret="circle" highlightCode={demoHighlight} />
  ),
  play: async ({canvasElement}) => {
    await waitFor(() => expect(canvasElement.textContent).toContain('Streaming Markdown'), {timeout: 10_000})
  },
}

// Animation off: new tokens appear instantly, no fade spans. Confirms the toggle.
export const NoAnimation: Story = {
  render: (args) => <StreamingDemo full={args.children} animated={false} highlightCode={demoHighlight} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText(/Streaming Markdown/)).toBeInTheDocument(), {timeout: 10_000})
    // Even when animated=false, we keep the span structure for stability, but duration is 0ms.
    // So we check that it's NOT animating (duration: 0ms).
    const span = canvasElement.querySelector('[data-sd-animate]')
    if (span) {
      expect(span.getAttribute('style')).toContain('--sd-duration:0ms')
    }
  },
}

// remend self-heals unterminated markdown: a half-streamed "**bold" renders as <strong>, not literal
// asterisks. With parseIncompleteMarkdown=false it stays literal — the side-by-side proof.
export const IncompleteMarkdown: Story = {
  render: () => (
    <div>
      <p>healed (parseIncompleteMarkdown, default):</p>
      <div class="sd-healed">
        <Streamdown animated={false}>{'streaming **bold text'}</Streamdown>
      </div>
      <p>raw (parseIncompleteMarkdown=false):</p>
      <div class="sd-raw">
        <Streamdown animated={false} parseIncompleteMarkdown={false}>
          {'streaming **bold text'}
        </Streamdown>
      </div>
    </div>
  ),
  play: async ({canvasElement}) => {
    // Healed: the dangling ** becomes <strong> (no literal asterisks).
    await waitFor(() => expect(canvasElement.querySelector('.sd-healed strong')).toBeTruthy())
    await expect(canvasElement.querySelector('.sd-healed')?.textContent ?? '').not.toContain('**')
    // Raw: asterisks stay literal, no <strong>.
    await expect(canvasElement.querySelector('.sd-raw strong')).toBeFalsy()
    await expect(canvasElement.querySelector('.sd-raw')?.textContent ?? '').toContain('**bold')
  },
}

// Raw HTML (opt-in via allowRawHtml): allow-listed tags (<kbd>) render; dangerous ones (<script>)
// are sanitized away. Off by default to keep parse5 out of the base bundle.
export const RawHtml: Story = {
  render: () => (
    <Streamdown animated={false} allowRawHtml>
      {'Press <kbd>Esc</kbd> to close.<script>alert(1)</script>'}
    </Streamdown>
  ),
  play: async ({canvasElement}) => {
    await waitFor(() => expect(canvasElement.querySelector('kbd')).toBeTruthy(), {timeout: 4000})
    await expect(canvasElement.querySelector('kbd')?.textContent).toBe('Esc')
    await expect(canvasElement.querySelector('script')).toBeFalsy()
  },
}

// harden neutralizes unsafe URLs: a javascript: link must not survive as an href.
export const LinkSafety: Story = {
  render: () => (
    <Streamdown animated={false}>{'[click me](javascript:alert(1)) and [ok](https://example.com)'}</Streamdown>
  ),
  play: async ({canvasElement}) => {
    const hrefs = Array.from(canvasElement.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')
    await expect(hrefs.some((h) => h.startsWith('javascript:'))).toBe(false)
    await expect(hrefs.some((h) => h.startsWith('https://example.com'))).toBe(true)
  },
}
