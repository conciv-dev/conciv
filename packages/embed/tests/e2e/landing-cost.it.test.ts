import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const STEPS = 30
const PACE_MS = 300
const FRAME_BUDGET_P95_MS = 20

const suite = setupWidgetSuite({})

function sourceLine(index: number): string {
  const body = [
    `export async function resolveStep${index}(input: PipelineInput, options: StepOptions = {}): Promise<StepResult> {`,
    `  const resolved = await lookupTable.get(input.steps[${index}]?.identifier ?? fallbackIdentifier)`,
    `  if (!resolved) throw new StepResolutionError('step ${index} could not be resolved', {cause: input})`,
    `  return {identifier: resolved.identifier, value: resolved.value * ${index + 1}, retries: options.retries ?? 0}`,
    '}',
    '',
  ]
  return body[index % body.length] ?? ''
}

function readResult(fileIndex: number, lines: number): string {
  return Array.from({length: lines}, (_, index) => {
    const number = String(index + 1).padStart(6, ' ')
    return `${number}\t${sourceLine(index + fileIndex)}`
  }).join('\n')
}

function readSteps(): Array<{name: string; input: Record<string, string>; result: string}> {
  return Array.from({length: STEPS}, (_, index) => ({
    name: 'Read',
    input: {file_path: `packages/pipeline/src/resolve-step-${index}.ts`},
    result: readResult(index, 40 + ((index * 7) % 120)),
  }))
}

test.describe('per landing main thread cost on the built bundle', () => {
  test('thirty realistic read results stay inside the frame budget', async ({page}) => {
    test.setTimeout(180_000)
    const script = suite.kit().harness.script
    script.scriptTurn({toolCalls: readSteps(), text: 'Every file is read.'})
    script.holdResults()

    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('read every pipeline file')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect(page.getByText('resolve-step-0.ts').first()).toBeVisible({timeout: 30_000})

    await page.evaluate((steps) => {
      const roots = [...document.querySelectorAll('*')]
        .map((element) => element.shadowRoot)
        .filter((root): root is ShadowRoot => root !== null)
      const list = roots
        .map((root) => root.querySelector('[aria-label="Execution trace"]'))
        .find((node): node is Element => node !== null)
      if (!list) throw new Error('no trace list in any shadow root')
      const state: {gaps: number[]; done: boolean} = {gaps: [], done: false}
      let previous = performance.now()
      const tick = (now: number) => {
        state.gaps.push(now - previous)
        previous = now
        if (!state.done) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      const observer = new MutationObserver(() => {
        if (list.querySelectorAll(':scope > li').length < steps) return
        observer.disconnect()
        state.done = true
      })
      observer.observe(list, {childList: true})
      Reflect.set(window, 'landingRig', state)
    }, STEPS)

    script.releaseResults({everyMs: PACE_MS})
    await page.waitForFunction(() => Reflect.get(window, 'landingRig')?.done === true, undefined, {timeout: 90_000})

    await page.waitForTimeout(2000)
    const report = await page.evaluate(() => {
      const state = Reflect.get(window, 'landingRig') as {gaps: number[]}
      const sorted = [...state.gaps].toSorted((left, right) => left - right)
      const at = (fraction: number) => Math.round((sorted[Math.floor(fraction * (sorted.length - 1))] ?? 0) * 10) / 10
      const roots = [...document.querySelectorAll('*')]
        .map((element) => element.shadowRoot)
        .filter((root): root is ShadowRoot => root !== null)
      const containers = roots.flatMap((root) => [...root.querySelectorAll('diffs-container')])
      const inner = containers.flatMap((node) => (node.shadowRoot ? [node.shadowRoot] : []))
      return {
        containers: containers.length,
        codeChars: inner.reduce((sum, root) => sum + (root.textContent ?? '').length, 0),
        frames: sorted.length,
        p50: at(0.5),
        p90: at(0.9),
        p95: at(0.95),
        max: at(1),
        over33: state.gaps.filter((gap) => gap > 33).length,
        over100: state.gaps.filter((gap) => gap > 100).length,
        worst: sorted.slice(-8).map(Math.round),
      }
    })
    console.log('[embed-landing]', JSON.stringify(report))

    expect(report.containers).toBeGreaterThanOrEqual(STEPS)
    expect(report.codeChars).toBeGreaterThan(0)
    expect(report.frames).toBeGreaterThan(STEPS)
    expect(report.p95).toBeLessThanOrEqual(FRAME_BUDGET_P95_MS)
  })
})
