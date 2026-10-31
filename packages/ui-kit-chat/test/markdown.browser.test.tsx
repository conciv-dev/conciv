import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {page} from 'vitest/browser'
import {createHighlighterCore} from 'shiki/core'
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript'
import {isHighlighterWarming, Markdown} from '../src/styled/markdown.js'
import {scheduleIdle, warmupLanguages} from '../src/styled/highlight-shared.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './helpers.js'
import {CodeBlock} from '../src/tools/styled/code-block.js'
import {ResultImage} from '../src/tools/styled/result-image.js'

describe('markdown highlight warmup', () => {
  describe('Thread eager highlighter warmup', () => {
    it('starts the highlighter as soon as the thread mounts, before any fence exists', () => {
      expect(isHighlighterWarming()).toBe(false)

      mountView(() => (
        <Thread>
          <span>no fences here yet</span>
        </Thread>
      ))

      expect(isHighlighterWarming()).toBe(true)
    })
  })

  describe('scheduleIdle', () => {
    const originalRequestIdleCallback = globalThis.requestIdleCallback

    afterEach(() => {
      globalThis.requestIdleCallback = originalRequestIdleCallback
      vi.useRealTimers()
    })

    it('runs the callback through requestIdleCallback when it is available', () => {
      let receivedCallback: IdleRequestCallback | undefined
      globalThis.requestIdleCallback = ((callback: IdleRequestCallback) => {
        receivedCallback = callback
        return 0
      }) as typeof requestIdleCallback

      let ran = false
      scheduleIdle(() => {
        ran = true
      })

      expect(receivedCallback).toBeDefined()
      expect(ran).toBe(false)
      receivedCallback?.({didTimeout: false, timeRemaining: () => 0})
      expect(ran).toBe(true)
    })

    it('passes a 500ms timeout so the warmup cannot be starved indefinitely under load', () => {
      let receivedOptions: IdleRequestOptions | undefined
      globalThis.requestIdleCallback = ((callback: IdleRequestCallback, options?: IdleRequestOptions) => {
        receivedOptions = options
        callback({didTimeout: false, timeRemaining: () => 0})
        return 0
      }) as typeof requestIdleCallback

      scheduleIdle(() => {})

      expect(receivedOptions).toEqual({timeout: 500})
    })

    it('falls back to a timer when requestIdleCallback is unavailable', () => {
      vi.useFakeTimers()
      // @ts-expect-error simulating an environment without requestIdleCallback
      globalThis.requestIdleCallback = undefined

      let ran = false
      scheduleIdle(() => {
        ran = true
      })
      expect(ran).toBe(false)
      vi.runAllTimers()
      expect(ran).toBe(true)
    })
  })

  describe('warmupLanguages', () => {
    it('compiles every loaded language so it highlights without error afterward', async () => {
      const highlighter = await createHighlighterCore({
        themes: [() => import('shiki/themes/github-light.mjs'), () => import('shiki/themes/github-dark.mjs')],
        langs: [() => import('shiki/langs/typescript.mjs'), () => import('shiki/langs/bash.mjs')],
        engine: createJavaScriptRegexEngine(),
      })

      warmupLanguages(highlighter)

      for (const language of highlighter.getLoadedLanguages()) {
        const html = highlighter.codeToHtml('const value = 1', {
          lang: language,
          themes: {light: 'github-light', dark: 'github-dark'},
          defaultColor: 'light',
        })
        expect(html).toContain('shiki')
      }
    })
  })

  function fence(lang: string, lines: Array<string>): string {
    return ['```' + lang, ...lines, '```'].join('\n')
  }

  function preElement(host: HTMLElement): HTMLElement {
    const found = host.querySelector('pre')
    if (found === null) throw new Error('expected a rendered pre element')
    return found
  }

  async function waitForHighlight(host: HTMLElement): Promise<void> {
    const wrapperDiv = preElement(host).parentElement
    if (wrapperDiv === null) throw new Error('expected a wrapper element around the pre')
    await expect.element(page.elementLocator(wrapperDiv)).toContainHTML('class="shiki')
  }

  function isHighlightRequestForLanguage(message: unknown, language: string): boolean {
    if (typeof message !== 'object' || message === null) return false
    if (!('type' in message) || message.type !== 'highlight') return false
    if (!('lang' in message)) return false
    return message.lang === language
  }

  function countHighlightPosts(language: string): {count: () => number; restore: () => void} {
    const originalPostMessage = Worker.prototype.postMessage
    let count = 0
    Worker.prototype.postMessage = function (
      message: unknown,
      _transferOrOptions?: Transferable[] | StructuredSerializeOptions,
    ): void {
      if (isHighlightRequestForLanguage(message, language)) count += 1
      originalPostMessage.call(this, message)
    }
    return {
      count: () => count,
      restore: () => {
        Worker.prototype.postMessage = originalPostMessage
      },
    }
  }

  describe('Markdown streaming highlight coalescing', () => {
    it('coalesces a burst of streaming snapshots into the in-flight request plus one deferred request, not one request per snapshot', async () => {
      const language = 'bash'
      const marker = `coalesce${Math.random().toString(36).slice(2)}`
      const snapshot = (line: number): string => fence(language, [`echo "${marker}-${line}"`])

      const priming = render(() => <Markdown content={fence(language, [`echo "${marker}-priming"`])} />)
      await waitForHighlight(priming.container)
      priming.unmount()

      const tracker = countHighlightPosts(language)
      try {
        const [content, setContent] = createSignal(snapshot(0))
        const host = mountView(() => <Markdown content={content()} streaming />)

        for (let line = 1; line < 6; line += 1) {
          setContent(snapshot(line))
        }

        await waitForHighlight(host)

        expect(tracker.count()).toBeLessThanOrEqual(2)
      } finally {
        tracker.restore()
      }
    })
  })
})

describe('code block static render', () => {
  const CONTENTS = ['const first = 1', 'const second = 2', 'const third = 3'].join('\n')

  it('renders a code body that never changes after mount', async () => {
    mountView(() => <CodeBlock file={{name: 'static.ts', lang: 'ts', contents: CONTENTS}} />)

    await expect.element(page.getByText('const third = 3', {exact: false})).toBeVisible()
  })
})

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

describe('markdown streaming fence tokens', () => {
  function openFence(lines: Array<string>): string {
    return ['```typescript', ...lines].join('\n')
  }

  function tokenSpan(host: HTMLElement, text: string): HTMLElement {
    const found = [...host.querySelectorAll('pre span')].find(
      (span): span is HTMLElement => span instanceof HTMLElement && span.textContent.trim() === text,
    )
    if (!found) throw new Error(`expected a token span for ${text}`)
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

  it('keeps highlighted tokens mounted while a streamed fence extends its unfinished last line', async () => {
    const suffix = Math.random().toString(36).slice(2)
    const primer = `primed${suffix}`
    mountView(() => <Markdown content={['```typescript', `const ${primer} = 0`, '```'].join('\n')} />)
    await expect.element(page.getByText(primer, {exact: true})).toBeVisible()

    const settled = `settled${suffix}`
    const growing = `growing${suffix}`
    const [content, setContent] = createSignal(openFence([`const ${settled} = 1`, `const ${growing.slice(0, 4)}`]))
    const host = mountView(() => <Markdown content={content()} streaming />)
    await expect.element(page.getByText(settled, {exact: true})).toBeVisible()
    const settledToken = tokenSpan(host, settled)
    const removals = watchRemovals(host)

    setContent(openFence([`const ${settled} = 1`, `const ${growing}`]))

    await expect.element(page.getByText(growing, {exact: true})).toBeVisible()
    expect(removals().filter((node) => node.contains(settledToken))).toEqual([])
    expect(settledToken.isConnected).toBe(true)
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
