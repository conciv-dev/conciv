import {describe, it, expect} from 'vitest'
import {createSignal, For, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {Streamdown, type HastElement, type HighlightCode} from '../src/streamdown.js'
import '../src/styles.css'

describe('highlighted fence stability', () => {
  function token(text: string): HastElement {
    return {
      type: 'element',
      tagName: 'span',
      properties: {style: 'color:var(--demo-token)'},
      children: [{type: 'text', value: text}],
    }
  }

  function highlighted(tokens: string[], version = 0): HastElement {
    return {
      type: 'element',
      tagName: 'pre',
      properties: {class: 'demo-shiki', 'data-version': String(version)},
      children: [{type: 'element', tagName: 'code', properties: {}, children: tokens.map(token)}],
    }
  }

  function fence(code: string): string {
    return ['```ts', code, '```'].join('\n')
  }

  function tokenSpan(container: HTMLElement, text: string): HTMLElement {
    const found = [...container.querySelectorAll('span')].find((span) => span.textContent === text)
    if (!found) throw new Error(`expected a token span for ${text}`)
    return found
  }

  function preElement(container: HTMLElement): HTMLElement {
    const found = container.querySelector('pre')
    if (!found) throw new Error('expected a rendered pre element')
    return found
  }

  function watchRemovals(target: Node): () => Node[] {
    const removed: Node[] = []
    const observer = new MutationObserver((records) => {
      removed.push(...records.flatMap((record) => [...record.removedNodes]))
    })
    observer.observe(target, {childList: true, subtree: true})
    return () => {
      removed.push(...observer.takeRecords().flatMap((record) => [...record.removedNodes]))
      observer.disconnect()
      return removed
    }
  }

  describe('Streamdown highlighted fences', () => {
    it('renders the token elements a highlight hook returns for a fence', async () => {
      render(() => (
        <Streamdown highlightCode={() => highlighted(['alphaToken', ' ', 'betaToken'])}>
          {fence('alphaToken betaToken')}
        </Streamdown>
      ))

      await expect.element(page.getByText('alphaToken', {exact: true})).toBeVisible()
      await expect.element(page.getByText('betaToken', {exact: true})).toBeVisible()
    })

    it('keeps the same token nodes when the hook re-runs with equal tokens', async () => {
      const [version, setVersion] = createSignal(0)
      const {container} = render(() => (
        <Streamdown highlightCode={() => highlighted(['alphaToken', ' ', 'betaToken'], version())}>
          {fence('alphaToken betaToken')}
        </Streamdown>
      ))

      await expect.element(page.getByText('alphaToken', {exact: true})).toBeVisible()
      const settled = tokenSpan(container, 'alphaToken')
      const settledText = settled.firstChild
      const removals = watchRemovals(preElement(container))

      setVersion(1)

      await expect.element(page.elementLocator(preElement(container))).toHaveAttribute('data-version', '1')
      expect(tokenSpan(container, 'alphaToken')).toBe(settled)
      expect(settled.firstChild).toBe(settledText)
      expect(removals()).toEqual([])
    })

    it('mounts only the new tokens while a highlighted fence grows during streaming', async () => {
      const [text, setText] = createSignal(fence('alphaToken'))
      const {container} = render(() => (
        <Streamdown
          animated={true}
          isAnimating={true}
          highlightCode={(code) => highlighted(code.trim().split(/(\s+)/))}
        >
          {text()}
        </Streamdown>
      ))

      await expect.element(page.getByText('alphaToken', {exact: true})).toBeVisible()
      const settled = tokenSpan(container, 'alphaToken')
      const removals = watchRemovals(preElement(container))

      setText(fence('alphaToken betaToken'))
      setText(fence('alphaToken betaToken gammaToken'))

      await expect.element(page.getByText('gammaToken', {exact: true})).toBeVisible()
      expect(tokenSpan(container, 'alphaToken')).toBe(settled)
      expect(removals().filter((node) => node === settled || node === settled.firstChild)).toEqual([])
    })
  })
})

describe('settled words', () => {
  const reply = 'No matches: the symbol is unused and safe to delete.'

  describe('Streamdown settled reply', () => {
    it('drops word spans once streaming stops, even without a final text change', async () => {
      const [streaming, setStreaming] = createSignal(true)
      render(() => (
        <Streamdown animated={true} isAnimating={streaming()}>
          {reply}
        </Streamdown>
      ))
      const paragraph = page.getByRole('paragraph')
      await expect.element(paragraph).toContainHTML('data-sd-word')

      setStreaming(false)

      await expect.element(paragraph).not.toContainHTML('data-sd-word')
      const nodes = [...paragraph.element().childNodes]
      expect(nodes.map((node) => [node.nodeType, node.textContent])).toEqual([[Node.TEXT_NODE, reply]])
    })
  })
})

describe('streamed text stability', () => {
  const chunks = [
    'The quick brown',
    'The quick brown fox jum',
    'The quick brown fox jumps over',
    'The quick brown fox jumps over the lazy dog',
  ]

  function renderedNodes(paragraph: Element): Node[] {
    return [
      ...paragraph.childNodes,
      ...[...paragraph.querySelectorAll('[data-sd-word]')].flatMap((span) => [...span.childNodes]),
    ]
  }

  describe('Streamdown streamed paragraph', () => {
    it('keeps already rendered word spans and text nodes in place as later chunks arrive', async () => {
      const [text, setText] = createSignal(chunks[0] ?? '')
      const {container} = render(() => (
        <Streamdown animated={true} isAnimating={true}>
          {text()}
        </Streamdown>
      ))

      await expect.element(page.getByText('brown')).toBeInTheDocument()
      const paragraph = container.querySelector('p')
      if (!paragraph) throw new Error('expected a paragraph')
      const settledNodes = renderedNodes(paragraph)

      const removed: Node[] = []
      const observer = new MutationObserver((records) => {
        removed.push(...records.flatMap((record) => [...record.removedNodes]))
      })
      observer.observe(paragraph, {childList: true, subtree: true})

      for (const chunk of chunks.slice(1)) setText(chunk)

      await expect.element(page.getByText('dog')).toBeInTheDocument()
      removed.push(...observer.takeRecords().flatMap((record) => [...record.removedNodes]))
      observer.disconnect()

      const currentNodes = new Set(renderedNodes(paragraph))
      expect(settledNodes.filter((node) => !currentNodes.has(node))).toEqual([])
      expect(removed.filter((node) => settledNodes.includes(node))).toEqual([])
    })
  })
})

describe('local file links', () => {
  const reply =
    'Open [the entry](src/app.ts:42), read `src/existing.ts` and `src/missing.ts`, then `src/late.ts` and `src/broken.ts`, or see [the docs](https://example.com/docs).'

  function OpenedFiles(props: {paths: string[]}): JSX.Element {
    return (
      <ul aria-label="Opened files">
        <For each={props.paths}>{(path) => <li>{path}</li>}</For>
      </ul>
    )
  }

  describe('Streamdown local file links', () => {
    it('hands links and existing paths to the host, leaves missing paths and web links alone', async () => {
      const [opened, setOpened] = createSignal<string[]>([])
      const asked: string[] = []
      const late = Promise.withResolvers<boolean>()
      const before = window.location.href
      render(() => (
        <>
          <section aria-label="With host">
            <Streamdown
              openLocalFile={(path) => setOpened((paths) => [...paths, path])}
              localFileExists={(path) => {
                asked.push(path)
                if (path === 'src/late.ts') return late.promise
                if (path === 'src/broken.ts') return Promise.reject(new Error('check failed'))
                return path === 'src/existing.ts'
              }}
            >
              {reply}
            </Streamdown>
            <OpenedFiles paths={opened()} />
          </section>
          <section aria-label="Without host">
            <Streamdown>{reply}</Streamdown>
          </section>
        </>
      ))
      const host = page.getByRole('region', {name: 'With host'})
      const plain = page.getByRole('region', {name: 'Without host'})
      const openedList = host.getByRole('list', {name: 'Opened files'})

      const entry = host.getByRole('link', {name: 'the entry'})
      await entry.click()
      await expect.element(openedList).toHaveTextContent('src/app.ts#L42')
      await expect.element(entry).toHaveFocus()
      expect(window.location.href).toBe(before)

      await userEvent.keyboard('{Enter}')
      await expect.element(openedList.getByRole('listitem').nth(1)).toHaveTextContent('src/app.ts#L42')

      await userEvent.keyboard('{Tab}')
      const existing = host.getByRole('link', {name: 'src/existing.ts'})
      await expect.element(existing).toHaveFocus()
      await userEvent.keyboard('{Enter}')
      await expect.element(openedList.getByRole('listitem').nth(2)).toHaveTextContent('src/existing.ts')
      await userEvent.keyboard(' ')
      await expect.element(openedList.getByRole('listitem').nth(3)).toHaveTextContent('src/existing.ts')
      await userEvent.keyboard('{Tab}')
      await expect.element(host.getByRole('link', {name: 'the docs'})).toHaveFocus()

      await host.getByText('src/missing.ts', {exact: true}).click()
      await host.getByText('src/broken.ts', {exact: true}).click()
      await existing.click()
      await expect.element(openedList.getByRole('listitem').nth(4)).toHaveTextContent('src/existing.ts')
      await expect.element(openedList.getByRole('listitem').nth(5)).not.toBeInTheDocument()

      late.resolve(true)
      await late.promise
      await host.getByRole('link', {name: 'src/late.ts'}).click()
      await expect.element(openedList.getByRole('listitem').nth(5)).toHaveTextContent('src/late.ts')
      await expect.element(host.getByRole('link', {name: 'src/broken.ts'})).not.toBeInTheDocument()
      expect(asked).toEqual(['src/existing.ts', 'src/missing.ts', 'src/late.ts', 'src/broken.ts'])

      await expect.element(host.getByRole('link', {name: 'the docs'})).toBeVisible()
      await expect.element(plain.getByRole('link', {name: 'the docs'})).toBeVisible()
      await expect.element(plain.getByText('the entry [blocked]')).toBeVisible()
      await expect.element(plain.getByRole('link', {name: 'the entry'})).not.toBeInTheDocument()
      expect(window.location.href).toBe(before)
    })

    it('asks about the paths of the block still streaming only once streaming ends, animated or not', async () => {
      const [streaming, setStreaming] = createSignal(true)
      const asked: string[] = []
      render(() => (
        <Streamdown
          animated={false}
          isAnimating={streaming()}
          openLocalFile={() => undefined}
          localFileExists={(path) => {
            asked.push(path)
            return true
          }}
        >
          {'Read `src/first.ts` first.\n\nThen `src/last.ts` next.'}
        </Streamdown>
      ))

      await expect.element(page.getByRole('link', {name: 'src/first.ts'})).toBeVisible()
      expect(asked).toEqual(['src/first.ts'])

      setStreaming(false)

      await expect.element(page.getByRole('link', {name: 'src/last.ts'})).toBeVisible()
      expect(asked).toEqual(['src/first.ts', 'src/last.ts'])
    })
  })
})

describe('fence view fallback', () => {
  function DecliningView(props: {code: string; fallback: () => void}): JSX.Element {
    return (
      <figure aria-label="Fence view">
        <figcaption>{props.code}</figcaption>
        <button type="button" onClick={() => props.fallback()}>
          Show the code
        </button>
      </figure>
    )
  }

  function ThrowingView(): JSX.Element {
    throw new Error('the view failed')
  }

  function InnerView(props: {code: string}): JSX.Element {
    return <figure aria-label="Inner view">{props.code}</figure>
  }

  function tokens(code: string): HastElement {
    const words = code.trim().split(' ')
    return {
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: {},
          children: words.map((word) => ({
            type: 'element',
            tagName: 'span',
            properties: {},
            children: [{type: 'text', value: word}],
          })),
        },
      ],
    }
  }

  const fenced: HighlightCode = (code, language) => {
    if (language === 'ts') return tokens(code)
    if (language === 'claimed') return {view: DecliningView, fallback: tokens(code)}
    if (language === 'nested') return {view: DecliningView, fallback: InnerView}
    return undefined
  }

  describe('Streamdown fence view fallback', () => {
    it('shows the code once a view falls back or throws, and mounts the view again for new code', async () => {
      const [code, setCode] = createSignal('first block')
      render(() => (
        <>
          <section aria-label="Declining">
            <Streamdown highlightCode={(_, language) => (language === 'demo' ? DecliningView : undefined)}>
              {['```demo', code(), '```'].join('\n')}
            </Streamdown>
          </section>
          <section aria-label="Throwing">
            <Streamdown highlightCode={(_, language) => (language === 'boom' ? ThrowingView : undefined)}>
              {['```boom', 'thrown block', '```'].join('\n')}
            </Streamdown>
          </section>
          <section aria-label="Claimed">
            <Streamdown highlightCode={fenced}>{['```claimed', 'alphaToken betaToken', '```'].join('\n')}</Streamdown>
          </section>
          <section aria-label="Unclaimed">
            <Streamdown highlightCode={fenced}>{['```ts', 'alphaToken betaToken', '```'].join('\n')}</Streamdown>
          </section>
          <section aria-label="Nested">
            <Streamdown highlightCode={fenced}>{['```nested', 'inner block', '```'].join('\n')}</Streamdown>
          </section>
        </>
      ))
      const declining = page.getByRole('region', {name: 'Declining'})
      const throwing = page.getByRole('region', {name: 'Throwing'})

      await expect.element(declining.getByRole('figure', {name: 'Fence view'}).getByText('first block')).toBeVisible()
      await declining.getByRole('button', {name: 'Show the code'}).click()
      await expect.element(declining.getByRole('figure', {name: 'Fence view'})).not.toBeInTheDocument()
      await expect.element(declining.getByText('first block')).toBeVisible()

      setCode('second block')
      await expect.element(declining.getByRole('figure', {name: 'Fence view'}).getByText('second block')).toBeVisible()
      await expect.element(declining.getByRole('button', {name: 'Show the code'})).toBeVisible()

      await expect.element(throwing.getByText('thrown block')).toBeVisible()

      const claimed = page.getByRole('region', {name: 'Claimed'})
      const unclaimed = page.getByRole('region', {name: 'Unclaimed'})
      await expect.element(unclaimed.getByText('alphaToken', {exact: true})).toBeVisible()
      await claimed.getByRole('button', {name: 'Show the code'}).click()
      await expect.element(claimed.getByRole('figure', {name: 'Fence view'})).not.toBeInTheDocument()
      await expect.element(claimed.getByText('alphaToken', {exact: true})).toBeVisible()
      await expect.element(claimed.getByText('betaToken', {exact: true})).toBeVisible()

      const nested = page.getByRole('region', {name: 'Nested'})
      await nested.getByRole('button', {name: 'Show the code'}).click()
      await expect.element(nested.getByRole('figure', {name: 'Inner view'}).getByText('inner block')).toBeVisible()
    })
  })
})

describe('structural streaming', () => {
  describe('Streamdown structural streaming', () => {
    it('does not crash while structure-changing markdown streams in character by character', async () => {
      const full =
        'The quick brown fox jumps over the lazy dog and then some **bold text** appears with a [link](https://example.com) and `inline code` too, plus more words to pad the paragraph out nicely so there is a real settled prefix before the formatting constructs complete.'
      const [text, setText] = createSignal('')

      const {container} = render(() => (
        <Streamdown animated={true} isAnimating={true}>
          {text()}
        </Streamdown>
      ))

      for (let i = 1; i <= full.length; i++) {
        setText(full.slice(0, i))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      expect(container.textContent).toContain('bold text')
    })

    it('does not crash while paragraphs, lists, and a blockquote merge and split character by character', async () => {
      const full =
        'First paragraph builds up some words here.\n\nSecond paragraph starts after a blank line gap.\n\n- one\n- two\n- three\n\n1. alpha\n2. beta\n\n> a blockquote line\n\nFinal **bold** closing paragraph with a [link](https://example.com) too.'
      const [text, setText] = createSignal('')

      const {container} = render(() => (
        <Streamdown animated={true} isAnimating={true}>
          {text()}
        </Streamdown>
      ))

      for (let i = 1; i <= full.length; i++) {
        setText(full.slice(0, i))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      expect(container.textContent).toContain('Final')
    })
  })
})
