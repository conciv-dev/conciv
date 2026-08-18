import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {describe, expect, it, vi} from 'vitest'
import {page} from 'vitest/browser'
import {createHighlighterCore} from 'shiki/core'
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript'
import {isHighlighterWarming, Markdown} from '../src/styled/markdown.js'
import {scheduleIdle, warmupLanguages} from '../src/styled/highlight-shared.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

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
  it('runs the callback through requestIdleCallback when it is available', () => {
    const originalRequestIdleCallback = globalThis.requestIdleCallback
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

    globalThis.requestIdleCallback = originalRequestIdleCallback
  })

  it('passes a 500ms timeout so the warmup cannot be starved indefinitely under load', () => {
    const originalRequestIdleCallback = globalThis.requestIdleCallback
    let receivedOptions: IdleRequestOptions | undefined
    globalThis.requestIdleCallback = ((callback: IdleRequestCallback, options?: IdleRequestOptions) => {
      receivedOptions = options
      callback({didTimeout: false, timeRemaining: () => 0})
      return 0
    }) as typeof requestIdleCallback

    scheduleIdle(() => {})

    expect(receivedOptions).toEqual({timeout: 500})

    globalThis.requestIdleCallback = originalRequestIdleCallback
  })

  it('falls back to a timer when requestIdleCallback is unavailable', () => {
    vi.useFakeTimers()
    const originalRequestIdleCallback = globalThis.requestIdleCallback
    // @ts-expect-error simulating an environment without requestIdleCallback
    globalThis.requestIdleCallback = undefined

    let ran = false
    scheduleIdle(() => {
      ran = true
    })
    expect(ran).toBe(false)
    vi.runAllTimers()
    expect(ran).toBe(true)

    globalThis.requestIdleCallback = originalRequestIdleCallback
    vi.useRealTimers()
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

describe('Markdown code fence highlight caching', () => {
  it('primes the shared highlighter before the cache behavior assertions run', async () => {
    const host = mountView(() => <Markdown content={fence('typescript', ['const readySignal = 1'])} />)
    await waitForHighlight(host)
  })

  it('renders the plain fallback synchronously on a cache miss, then swaps in highlighted markup once the scheduled highlight resolves', async () => {
    const marker = `cacheMiss${Math.random().toString(36).slice(2)}`
    const content = fence('typescript', [`const ${marker} = 1`])

    const host = mountView(() => <Markdown content={content} />)

    expect(preElement(host).className).not.toContain('shiki')
    expect(host.textContent).toContain(marker)

    await waitForHighlight(host)
  })

  it('renders a previously highlighted fence with highlighted markup immediately, without waiting for a scheduled highlight', async () => {
    const marker = `cacheHit${Math.random().toString(36).slice(2)}`
    const content = fence('typescript', [`const ${marker} = 1`])

    const primingHost = mountView(() => <Markdown content={content} />)
    await waitForHighlight(primingHost)

    const host = mountView(() => <Markdown content={content} />)
    expect(preElement(host).className).toContain('shiki')
  })

  it('defers highlighting a streaming fence until its content stops changing between renders, avoiding per-keystroke shiki work', async () => {
    const marker = `growing${Math.random().toString(36).slice(2)}`
    const lineOne = `const ${marker} = 1`
    const growingA = fence('typescript', [lineOne])
    const growingB = fence('typescript', [lineOne, '// still streaming'])
    const stabilizedWithTrailer = `${growingB}\n\nmore prose after the fence`

    const [content, setContent] = createSignal(growingA)
    const host = mountView(() => <Markdown content={content()} streaming />)

    expect(preElement(host).className).not.toContain('shiki')

    setContent(growingB)
    await Promise.resolve()
    expect(preElement(host).className).not.toContain('shiki')

    setContent(stabilizedWithTrailer)
    await waitForHighlight(host)
  })

  it('caches a superseded streaming fence result so a later fence with the same code reuses it instead of re-highlighting', async () => {
    const primingMarker = `readyBeforeSupersede${Math.random().toString(36).slice(2)}`
    const primingHost = mountView(() => <Markdown content={fence('typescript', [`const ${primingMarker} = 0`])} />)
    await waitForHighlight(primingHost)

    const markerA = `superseded${Math.random().toString(36).slice(2)}`
    const markerB = `winning${Math.random().toString(36).slice(2)}`
    const codeA = `const ${markerA} = 1`
    const codeB = `const ${markerB} = 2`
    const content = [fence('typescript', [codeA]), '', fence('typescript', [codeB])].join('\n')

    const rendered = render(() => <Markdown content={content} streaming />)
    rendered.unmount()

    const detectorHost = mountView(() => <Markdown content={fence('typescript', [codeB])} />)
    await waitForHighlight(detectorHost)

    const laterHost = mountView(() => <Markdown content={fence('typescript', [codeA])} />)
    expect(preElement(laterHost).className).toContain('shiki')
  })
})

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
