import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {Markdown} from '../src/styled/markdown.js'
import {mountView} from './helpers.js'
import {CodeBlock} from '../src/tools/styled/code-block.js'
import {ResultImage} from '../src/tools/styled/result-image.js'

describe('code block streaming growth', () => {
  const LINES = 24

  function line(index: number): string {
    return `const step${index} = await resolve(steps[${index}])`
  }

  function body(count: number): string {
    return Array.from({length: count}, (_, index) => line(index)).join('\n')
  }

  it('grows the tool card code body line by line while the file contents stream in', async () => {
    const [lines, setLines] = createSignal(1)
    mountView(() => <CodeBlock file={{name: 'pipeline.ts', lang: 'ts', contents: body(lines())}} />)

    for (let count = 1; count <= LINES; count += 1) {
      setLines(count)
      await expect.element(page.getByText(line(count - 1), {exact: false})).toBeVisible()
    }
    await expect.element(page.getByText(line(0), {exact: false})).toBeVisible()
  })
})

describe('markdown code highlight', () => {
  const FENCE = ['```ts', 'const total = 1', '```'].join('\n')

  it('paints a fenced block with shiki tokens delivered by the inline highlight worker', async () => {
    mountView(() => <Markdown content={FENCE} />)

    await expect.element(page.getByText('const', {exact: true})).toBeVisible()
  })
})

describe('markdown code selection', () => {
  function fence(lines: Array<string>): string {
    return ['```typescript', ...lines, '```'].join('\n')
  }

  function textNodeOf(host: HTMLElement, text: string): Text {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data.trim() === text) return node
    }
    throw new Error(`expected a text node for ${text}`)
  }

  it('keeps a selection inside a highlighted fence while the fence keeps streaming', async () => {
    const marker = `selected${Math.random().toString(36).slice(2)}`
    const laterMarker = `arrived${Math.random().toString(36).slice(2)}`
    const lineOne = `const ${marker} = 1`
    const [content, setContent] = createSignal(fence([lineOne]))
    const host = mountView(() => <Markdown content={content()} streaming />)

    await expect.element(page.getByText(marker, {exact: true})).toBeVisible()
    const selected = textNodeOf(host, marker)
    document.getSelection()?.setBaseAndExtent(selected, 0, selected, selected.length)
    const selectedText = document.getSelection()?.toString()

    setContent(fence([lineOne, `const ${laterMarker} = 2`]))

    await expect.element(page.getByText(laterMarker, {exact: true})).toBeVisible()
    expect(selectedText).toContain(marker)
    expect(document.getSelection()?.toString()).toBe(selectedText)
  })
})

describe('markdown mermaid diagram', () => {
  const FLOWCHART_FENCE = ['```mermaid', 'flowchart LR', '  A[Save file] --> B[Watcher fires]', '```'].join('\n')
  const SECOND_FENCE = ['```mermaid', 'flowchart LR', '  C[Rebuild] --> D[Reload page]', '```'].join('\n')
  const INVALID_FENCE = ['```mermaid', 'flowchart LR', '  E[Broken --> ((', '```'].join('\n')

  it('draws a settled mermaid fence as a diagram', async () => {
    mountView(() => <Markdown content={FLOWCHART_FENCE} />)

    await expect.element(page.getByText('Watcher fires', {exact: true})).toBeVisible()
    await expect.element(page.getByText('A[Save file] --> B[Watcher fires]', {exact: false})).not.toBeInTheDocument()
  })

  it('keeps a streaming mermaid fence as code and draws it once streaming settles', async () => {
    const [streaming, setStreaming] = createSignal(true)
    mountView(() => <Markdown content={FLOWCHART_FENCE} streaming={streaming()} />)
    mountView(() => <Markdown content={SECOND_FENCE} />)

    await expect.element(page.getByText('Reload page', {exact: true})).toBeVisible()
    await expect.element(page.getByText('A[Save file] --> B[Watcher fires]', {exact: false})).toBeVisible()
    await expect.element(page.getByText('Watcher fires', {exact: true})).not.toBeInTheDocument()

    setStreaming(false)

    await expect.element(page.getByText('Watcher fires', {exact: true})).toBeVisible()
  })

  it('leaves a mermaid fence that does not parse as a plain code block', async () => {
    mountView(() => <Markdown content={INVALID_FENCE} />)
    mountView(() => <Markdown content={SECOND_FENCE} />)

    await expect.element(page.getByText('Reload page', {exact: true})).toBeVisible()
    await expect.element(page.getByText('E[Broken --> ((', {exact: false})).toBeVisible()
  })
})

describe('markdown streaming growth', () => {
  const CHUNK = 56
  const CLOSING = 'That is the whole helper.'
  const CODE_LINES = 12

  function answer(): string {
    return [
      'Here is the helper you asked for.',
      '',
      '```ts',
      'export async function resolveEveryStep(input: Input): Promise<Step[]> {',
      ...Array.from({length: CODE_LINES}, (_, index) => `  const step${index} = await resolve(input.steps[${index}])`),
      '  return [step0]',
      '}',
      '```',
      '',
      CLOSING,
    ].join('\n')
  }

  function slices(text: string): string[] {
    return Array.from({length: Math.ceil(text.length / CHUNK)}, (_, index) => text.slice(0, (index + 1) * CHUNK))
  }

  it('grows a fenced code block as the markdown streams in', async () => {
    const full = answer()
    const [content, setContent] = createSignal('')
    mountView(() => <Markdown content={content()} streaming />)

    const sampled: number[] = []
    for (const step of slices(full)) {
      setContent(step)
      await new Promise((resolve) => setTimeout(resolve, 16))
      const block = document.querySelector('.prose-chat pre')
      sampled.push((block?.textContent ?? '').length)
    }

    await expect.element(page.getByText(CLOSING, {exact: true})).toBeVisible()
    expect(document.querySelectorAll('.prose-chat pre').length).toBe(1)
    expect(sampled.filter((length) => length > 0).length).toBeGreaterThanOrEqual(10)
    expect(sampled.toSorted((left, right) => left - right)).toEqual(sampled)
  })
})

describe('result image', () => {
  describe('ResultImage', () => {
    it('renders the image with the given alt text', async () => {
      render(() => <ResultImage src="data:image/png;base64,QUJD" alt="canvas draw" />)
      await expect.element(page.getByRole('img', {name: 'canvas draw'})).toBeVisible()
    })
  })
})
