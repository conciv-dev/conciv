import {createRoot, createSignal} from 'solid-js'
import {expect, test, vi} from 'vitest'
import {syncRender} from '../src/render-sync.js'

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
