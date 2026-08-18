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
      const withLoaf = window as typeof window & {
        __loafEntries?: PerformanceEntry[]
        __resizeObserverCallbackCount?: number
      }
      withLoaf.__loafEntries = []
      const observer = new PerformanceObserver((list) => {
        withLoaf.__loafEntries?.push(...list.getEntries())
      })
      observer.observe({type: 'long-animation-frame', buffered: true})

      withLoaf.__resizeObserverCallbackCount = 0
      const NativeResizeObserver = window.ResizeObserver
      window.ResizeObserver = class extends NativeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super((observerEntries, observerInstance) => {
            withLoaf.__resizeObserverCallbackCount = (withLoaf.__resizeObserverCallbackCount ?? 0) + 1
            callback(observerEntries, observerInstance)
          })
        }
      }
    })

    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await switchToSessionByTitle(page, title)
    await expect(page.getByText(`seed message ${TURN_COUNT - 1}`).first()).toBeVisible({timeout: 30_000})

    await page.waitForTimeout(500)

    const rowCount = await page.locator('[data-index]').count()
    expect(rowCount).toBeGreaterThan(0)
    expect(rowCount).toBeLessThan(TURN_COUNT)

    const {entries, resizeObserverCallbackCount} = await page.evaluate(() => {
      const withLoaf = window as typeof window & {
        __loafEntries?: PerformanceEntry[]
        __resizeObserverCallbackCount?: number
      }
      return {
        entries: (withLoaf.__loafEntries ?? []).map((entry) => entry.toJSON()) as LoafEntry[],
        resizeObserverCallbackCount: withLoaf.__resizeObserverCallbackCount ?? 0,
      }
    })

    expect(
      resizeObserverCallbackCount,
      'the viewport resize observer never fired, so this scenario never exercised the estimator/virtualizer remeasure path it claims to test',
    ).toBeGreaterThan(0)

    const websocketAttributedEntries = entries.filter((entry) =>
      scriptMatches(entry.scripts, /DOMWebSocket\.onmessage|_handleMessage/),
    )
    expect(
      websocketAttributedEntries,
      'no long-animation-frame entry was attributed to the MESSAGES_SNAPSHOT websocket handler, so this scenario never generated the ingestion load it claims to test',
    ).not.toHaveLength(0)

    const websocketEntriesMixingRemeasure = websocketAttributedEntries.filter((entry) =>
      scriptMatches(entry.scripts, /ResizeObserverCallback/),
    )
    expect(
      websocketEntriesMixingRemeasure,
      'the estimator/virtualizer remeasure pass triggered by the viewport resize observer must run in its own frame (rAF-scheduled), never synchronously inside the same long-animation-frame as the MESSAGES_SNAPSHOT websocket handler',
    ).toHaveLength(0)
  })
})
