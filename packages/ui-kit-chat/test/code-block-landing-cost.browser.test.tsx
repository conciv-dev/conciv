import 'virtual:uno.css'
import {For, createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {CodeBlock} from '../src/tools/styled/code-block.js'
import {mountView} from './mount-view.js'

const LANDINGS = 30
const FILE_LINES = 100
const PACE_MS = 120
const FRAME_BUDGET_P95_MS = 20
const FRAME_BUDGET_MAX_MS = 100
const LAST_MARKER = `resolveStep${LANDINGS - 1}`

function sourceFile(index: number): string {
  return Array.from({length: FILE_LINES}, (_, line) => {
    const shapes = [
      `export async function resolveStep${index}(input: PipelineInput, options: StepOptions = {}): Promise<StepResult> {`,
      `  const resolved = await lookupTable.get(input.steps[${line}]?.identifier ?? fallbackIdentifier)`,
      `  if (!resolved) throw new StepResolutionError('step ${line} could not be resolved', {cause: input})`,
      `  return {identifier: resolved.identifier, value: resolved.value * ${line + 1}, retries: options.retries ?? 0}`,
      '}',
      '',
    ]
    return shapes[line % shapes.length] ?? ''
  }).join('\n')
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.floor(fraction * (sorted.length - 1))
  return sorted[index] ?? 0
}

it('keeps the main thread responsive while thirty tool results land', async () => {
  const [landed, setLanded] = createSignal<number[]>([])
  mountView(() => (
    <For each={landed()}>
      {(index) => <CodeBlock file={{name: `resolve-step-${index}.ts`, lang: 'ts', contents: sourceFile(index)}} />}
    </For>
  ))

  const gaps: number[] = []
  const recorder = {running: true}
  let previous = performance.now()
  const tick = (now: number): void => {
    gaps.push(now - previous)
    previous = now
    if (recorder.running) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  for (let index = 0; index < LANDINGS; index += 1) {
    setLanded((current) => [...current, index])
    await wait(PACE_MS)
  }
  await expect.element(page.getByText(LAST_MARKER, {exact: false}).first()).toBeVisible()
  recorder.running = false

  const sorted = gaps.toSorted((left, right) => left - right)
  const report = {
    frames: sorted.length,
    p50: Math.round(percentile(sorted, 0.5) * 10) / 10,
    p95: Math.round(percentile(sorted, 0.95) * 10) / 10,
    max: Math.round(percentile(sorted, 1) * 10) / 10,
    over100: gaps.filter((gap) => gap > FRAME_BUDGET_MAX_MS).length,
  }
  console.log('[code-block-landing-cost]', JSON.stringify(report))

  expect(report.frames).toBeGreaterThan(LANDINGS)
  expect(report.p95).toBeLessThanOrEqual(FRAME_BUDGET_P95_MS)
  expect(report.max).toBeLessThanOrEqual(FRAME_BUDGET_MAX_MS)
})
