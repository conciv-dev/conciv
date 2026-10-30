import {describe, it, expect} from 'vitest'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page} from 'vitest/browser'
import {Streamdown, type HastElement} from '../src/streamdown.js'
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
