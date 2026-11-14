import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {createSignal, For, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {describe, expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {Markdown, MarkdownProvider} from '../src/styled/markdown.js'
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

  function findTextNode(host: HTMLElement, text: string): Text {
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
    const selected = findTextNode(host, marker)
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

describe('markdown provider', () => {
  const REPLY = [
    'Read `src/existing.ts` and `src/missing.ts`.',
    '',
    '```chart',
    'sales by month',
    '```',
    '',
    '```chart',
    'declined chart',
    '```',
  ].join('\n')

  function OpenedFiles(props: {paths: string[]}): JSX.Element {
    return (
      <ul aria-label="Opened files">
        <For each={props.paths}>{(path) => <li>{path}</li>}</For>
      </ul>
    )
  }

  function chartBlocks(rendered: string[]) {
    return {
      current: () => ({render: new Set(['chart']), actions: new Set<string>()}),
      render: (target: HTMLElement, block: {code: string; language: string}) => {
        rendered.push(`${block.language}:${block.code}`)
        if (block.code === 'declined chart') return undefined
        const figure = document.createElement('figure')
        figure.setAttribute('aria-label', 'Chart')
        figure.textContent = `Chart of ${block.code}`
        target.append(figure)
        return () => figure.remove()
      },
      actions: () => [],
    }
  }

  it('hands its file handlers and code block content to the Markdown below, and turns content off below codeBlocks false', async () => {
    const [opened, setOpened] = createSignal<string[]>([])
    const rendered: string[] = []
    mountView(() => (
      <MarkdownProvider
        openLocalFile={(path) => setOpened((paths) => [...paths, path])}
        localFileExists={(path) => path === 'src/existing.ts'}
        codeBlocks={chartBlocks(rendered)}
      >
        <section aria-label="With content">
          <Markdown content={REPLY} />
          <OpenedFiles paths={opened()} />
        </section>
        <MarkdownProvider codeBlocks={false}>
          <section aria-label="Without content">
            <Markdown content={REPLY} />
          </section>
        </MarkdownProvider>
      </MarkdownProvider>
    ))
    const content = page.getByRole('region', {name: 'With content'})
    const plain = page.getByRole('region', {name: 'Without content'})

    await expect.element(content.getByRole('figure', {name: 'Chart'})).toHaveTextContent('Chart of sales by month')
    await expect.element(content.getByText('declined chart')).toBeVisible()
    await expect.element(content.getByText('sales by month', {exact: true})).not.toBeInTheDocument()

    const existing = content.getByRole('link', {name: 'src/existing.ts'})
    await existing.click()
    await expect.element(content.getByRole('list', {name: 'Opened files'})).toHaveTextContent('src/existing.ts')
    await expect.element(existing).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(content.getByRole('list', {name: 'Opened files'}).getByRole('listitem').nth(1))
      .toHaveTextContent('src/existing.ts')
    await expect.element(content.getByRole('link', {name: 'src/missing.ts'})).not.toBeInTheDocument()

    await expect.element(plain.getByText('sales by month')).toBeVisible()
    await expect.element(plain.getByRole('figure', {name: 'Chart'})).not.toBeInTheDocument()
    await expect.element(plain.getByRole('link', {name: 'src/existing.ts'})).not.toBeInTheDocument()
    expect(rendered).toEqual(['chart:sales by month', 'chart:declined chart'])
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
      render(() => (
        <ResultImage
          src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
          alt="canvas draw"
        />
      ))
      await expect.element(page.getByRole('img', {name: 'canvas draw'})).toBeVisible()
    })
  })
})
