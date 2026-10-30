import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {DEFAULT_THEMES, FileRenderer, renderFileWithHighlighter} from '@pierre/diffs'
import type {FileContents, RenderFileOptions} from '@pierre/diffs'
import {createRoot, createSignal} from 'solid-js'
import {describe, expect, it, test, vi} from 'vitest'
import {syncRender} from '../src/render-sync.js'

describe('build externals', () => {
  const bundle = readFileSync(fileURLToPath(new URL('../dist/index.js', import.meta.url)), 'utf8')

  const externalized = (specifier: string): boolean =>
    new RegExp(`from\\s*["']${specifier.replaceAll('/', '\\/')}`).test(bundle)

  describe('solid-diffs build keeps its pacing runtime shared with the host', () => {
    it('externalizes @tanstack/solid-pacer so the widget ships one throttler runtime', () => {
      expect(externalized('@tanstack/solid-pacer')).toBe(true)
    })

    it('externalizes solid-js so the reactive runtime stays the host copy', () => {
      expect(externalized('solid-js')).toBe(true)
    })
  })
})

describe('render sync', () => {
  const UPDATE_COUNT = 12
  const UPDATE_INTERVAL_MS = 10
  const SETTLE_TIMEOUT_MS = 2_000

  type StreamedPayload = {contents: string}

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds)
    })
  }

  function countingTarget() {
    const rendered: string[] = []
    return {
      rendered,
      setOptions: () => {},
      render: (input: StreamedPayload & {forceRender: boolean}) => {
        rendered.push(input.contents)
      },
    }
  }

  test('a stream of content updates renders fewer times than it updates and settles on the final content', async () => {
    const target = countingTarget()
    const [contents, setContents] = createSignal('chunk 0')
    const dispose = createRoot((disposeRoot) => {
      syncRender<undefined, StreamedPayload>({
        target: () => target,
        payload: () => ({contents: contents()}),
        options: () => undefined,
      })
      return disposeRoot
    })
    try {
      for (let index = 1; index <= UPDATE_COUNT; index += 1) {
        setContents(`chunk ${index}`)
        await delay(UPDATE_INTERVAL_MS)
      }
      await vi.waitFor(() => expect(target.rendered.at(-1)).toBe(`chunk ${UPDATE_COUNT}`), {timeout: SETTLE_TIMEOUT_MS})
      expect(target.rendered.length).toBeGreaterThan(0)
      expect(target.rendered.length).toBeLessThan(UPDATE_COUNT)
    } finally {
      dispose()
    }
  })
})

describe('stale highlight result', () => {
  const renderOptions: RenderFileOptions = {
    theme: DEFAULT_THEMES,
    useTokenTransformer: false,
    tokenizeMaxLineLength: 1000,
  }

  const makeStreamingFile = (lineCount: number): FileContents => ({
    name: 'streaming.ts',
    contents: Array.from({length: lineCount}, (_, index) => `const value${index} = ${index}\n`).join(''),
  })

  test('a highlight for a superseded file never replaces the current render', async () => {
    let renderUpdates = 0
    const renderer = new FileRenderer({theme: DEFAULT_THEMES}, undefined, () => {
      renderUpdates += 1
    })
    const earlyFile = makeStreamingFile(3)
    const currentFile = makeStreamingFile(9)

    renderer.renderFile(earlyFile)
    const highlighter = await renderer.initializeHighlighter()
    const staleResult = renderFileWithHighlighter(earlyFile, highlighter, renderOptions)

    renderer.renderFile(currentFile)
    const updatesBeforeStaleResult = renderUpdates
    renderer.onHighlightSuccess(earlyFile, staleResult, renderOptions)

    expect(renderer.renderFile()?.totalLines).toBe(10)
    expect(renderUpdates).toBe(updatesBeforeStaleResult)
  })
})
