import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {createSignal, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {beforeEach, expect, it} from 'vitest'
import {Trace, type TraceItem} from '../src/styled/trace/trace.js'
import {TraceToolRow} from '../src/styled/trace/trace-row.js'
import {TraceOutputBlock} from '../src/styled/trace/output-block.js'
import {mountView} from './mount-view.js'

const ROW_COUNT = 40
const RELEASE_STEPS = 30

const windowErrors: string[] = []
window.addEventListener('error', (event) => {
  windowErrors.push(typeof event.message === 'string' ? event.message : String(event))
})

beforeEach(() => {
  windowErrors.length = 0
})

function outputAt(index: number, step: number): string {
  const lines = 2 + ((index + step * 5) % 24)
  return Array.from({length: lines}, (_, line) => `src/module-${index}.ts:${line} matched the pattern`).join('\n')
}

function rows(step: () => number): TraceItem[] {
  return Array.from({length: ROW_COUNT}, (_, index) => ({
    key: `row-${index}`,
    render: (branch) => (
      <TraceToolRow
        projection={{mark: 'pass', label: 'grep', target: `src/module-${index}.ts`, meta: 'matches'}}
        ring={branch.ring}
        body={() => <TraceOutputBlock text={outputAt(index, step())}>{outputAt(index, step())}</TraceOutputBlock>}
      />
    ),
  }))
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function resizeLoopErrors(): string[] {
  return windowErrors.filter((message) => message.includes('ResizeObserver loop'))
}

function mountPacedTrace(): (step: number) => void {
  const [step, setStep] = createSignal(0)
  mountView(
    (): JSX.Element => (
      <Trace summary={`${ROW_COUNT} tools ran`} compactLine={`${ROW_COUNT} tools`} items={rows(step)} defaultOpen />
    ),
  )
  return setStep
}

it('re-sizing trace bodies under a paced release never trips a ResizeObserver notification loop', async () => {
  const release = mountPacedTrace()
  await expect.element(page.getByText(`src/module-${ROW_COUNT - 1}.ts`).first()).toBeVisible()

  for (let step = 1; step <= RELEASE_STEPS; step++) {
    release(step)
    await nextFrame()
  }

  expect(resizeLoopErrors()).toEqual([])
})
