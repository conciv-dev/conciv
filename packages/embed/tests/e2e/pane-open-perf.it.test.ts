import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel, switchToSessionByTitle} from './helpers/panel.js'

const TURN_COUNT = 400

const suite = setupWidgetSuite()

type ScriptEntry = {invoker?: string; sourceFunctionName?: string}
type LoafEntry = {scripts?: ScriptEntry[]}

async function seedTranscript(sessionId: string, turns: number): Promise<void> {
  const kit = suite.kit()
  const keeper = await kit.attach(sessionId)
  for (let index = 0; index < turns; index += 1) {
    await kit.chat(`seed message ${index}`, sessionId)
    await keeper.done({hangGuardMs: 10_000})
  }
}

function scriptMatches(scripts: ScriptEntry[] | undefined, pattern: RegExp): boolean {
  return (scripts ?? []).some(
    (script) =>
      (typeof script.invoker === 'string' && pattern.test(script.invoker)) ||
      (typeof script.sourceFunctionName === 'string' && pattern.test(script.sourceFunctionName)),
  )
}

test.describe('pane-open perf with a large restored transcript', () => {
  test('the estimator/virtualizer remeasure never shares an animation frame with the MESSAGES_SNAPSHOT websocket handler', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const {sessionId} = await suite.kit().rpc.sessions.create()
    const title = `big transcript ${sessionId.slice(-12)}`
    await suite.kit().rpc.sessions.rename({sessionId, title})
    await seedTranscript(sessionId, TURN_COUNT)

    await page.addInitScript(() => {
      const withLoaf = window as typeof window & {__loafEntries?: PerformanceEntry[]}
      withLoaf.__loafEntries = []
      const observer = new PerformanceObserver((list) => {
        withLoaf.__loafEntries?.push(...list.getEntries())
      })
      observer.observe({type: 'long-animation-frame', buffered: true})
    })

    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await switchToSessionByTitle(page, title)
    await expect(page.getByText(`seed message ${TURN_COUNT - 1}`).first()).toBeVisible({timeout: 30_000})

    await page.waitForTimeout(500)

    const rowCount = await page.locator('[data-index]').count()
    expect(rowCount).toBeGreaterThan(0)
    expect(rowCount).toBeLessThan(TURN_COUNT)

    const entries = await page.evaluate(() => {
      const withLoaf = window as typeof window & {__loafEntries?: PerformanceEntry[]}
      return (withLoaf.__loafEntries ?? []).map((entry) => entry.toJSON()) as LoafEntry[]
    })

    const framesMixingIngestionAndRemeasure = entries.filter(
      (entry) =>
        scriptMatches(entry.scripts, /DOMWebSocket\.onmessage|_handleMessage/) &&
        scriptMatches(entry.scripts, /ResizeObserverCallback/),
    )
    expect(
      framesMixingIngestionAndRemeasure,
      'the estimator/virtualizer remeasure pass triggered by the viewport resize observer must run in its own frame (rAF-scheduled), never synchronously inside the same long-animation-frame as the MESSAGES_SNAPSHOT websocket handler',
    ).toHaveLength(0)
  })
})
