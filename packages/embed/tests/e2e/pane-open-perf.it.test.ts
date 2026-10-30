import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel, switchToSessionByTitle} from './helpers/panel.js'

const EXCHANGE_COUNT = 400
const TOTAL_TURN_COUNT = EXCHANGE_COUNT * 2

const suite = setupWidgetSuite()

type RemeasureProbe = {
  textShapingCalls: number
  textShapingInsideThreadViewportCallbacks: number
  threadViewportCallbacks: number
}

declare global {
  interface Window {
    remeasureProbe?: RemeasureProbe
  }
}

async function seedTranscript(sessionId: string, exchanges: number): Promise<void> {
  const kit = suite.kit()
  for (let index = 0; index < exchanges; index += 1) {
    const turn = await kit.chat(`seed message ${index}`, sessionId)
    await turn.done({hangGuardMs: 10_000})
  }
}

test.describe('pane-open perf with a large restored transcript', () => {
  test('the estimator/virtualizer remeasure never runs inside the thread viewport resize observer', async ({page}) => {
    test.setTimeout(240_000)
    const {sessionId} = await suite.kit().rpc.sessions.create()
    const title = `big transcript ${sessionId.slice(-12)}`
    await suite.kit().rpc.sessions.rename({sessionId, title})
    await seedTranscript(sessionId, EXCHANGE_COUNT)

    await page.addInitScript(() => {
      const probe: RemeasureProbe = {
        textShapingCalls: 0,
        textShapingInsideThreadViewportCallbacks: 0,
        threadViewportCallbacks: 0,
      }
      window.remeasureProbe = probe
      const insideThreadViewportCallback = {active: false}
      const countShaping = (): void => {
        probe.textShapingCalls += 1
        if (insideThreadViewportCallback.active) probe.textShapingInsideThreadViewportCallbacks += 1
      }
      const offscreenMeasureText = OffscreenCanvasRenderingContext2D.prototype.measureText
      OffscreenCanvasRenderingContext2D.prototype.measureText = function measureText(text) {
        countShaping()
        return offscreenMeasureText.call(this, text)
      }
      const canvasMeasureText = CanvasRenderingContext2D.prototype.measureText
      CanvasRenderingContext2D.prototype.measureText = function measureText(text) {
        countShaping()
        return canvasMeasureText.call(this, text)
      }

      const NativeResizeObserver = window.ResizeObserver
      window.ResizeObserver = class extends NativeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super((observerEntries, observerInstance) => {
            if (!observerEntries.some((entry) => entry.target.hasAttribute('data-thread-viewport'))) {
              callback(observerEntries, observerInstance)
              return
            }
            probe.threadViewportCallbacks += 1
            insideThreadViewportCallback.active = true
            try {
              callback(observerEntries, observerInstance)
            } finally {
              insideThreadViewportCallback.active = false
            }
          })
        }
      }
    })

    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await switchToSessionByTitle(page, title)
    await expect(page.getByText(`seed message ${EXCHANGE_COUNT - 1}`).first()).toBeVisible({timeout: 30_000})

    const rowCount = await page.locator('[data-index]').count()
    expect(rowCount).toBeGreaterThan(0)
    expect(rowCount).toBeLessThan(TOTAL_TURN_COUNT)

    const readProbe = () =>
      page.evaluate(
        (): RemeasureProbe => ({
          textShapingCalls: window.remeasureProbe?.textShapingCalls ?? 0,
          textShapingInsideThreadViewportCallbacks:
            window.remeasureProbe?.textShapingInsideThreadViewportCallbacks ?? 0,
          threadViewportCallbacks: window.remeasureProbe?.threadViewportCallbacks ?? 0,
        }),
      )

    const beforeResize = await readProbe()

    const viewportSizeBeforeResize = page.viewportSize()
    await page.setViewportSize({
      width: 420,
      height: viewportSizeBeforeResize?.height ?? 720,
    })

    await expect
      .poll(async () => (await readProbe()).textShapingCalls, {
        message:
          'the viewport resize never re-ran the estimator, so this scenario never exercised the estimator/virtualizer remeasure path it claims to test',
      })
      .toBeGreaterThan(beforeResize.textShapingCalls)

    const afterResize = await readProbe()

    expect(
      afterResize.threadViewportCallbacks,
      'the thread viewport resize observer never fired on the resize, so the remeasure was never triggered through it',
    ).toBeGreaterThan(beforeResize.threadViewportCallbacks)
    expect(
      afterResize.textShapingInsideThreadViewportCallbacks,
      'the estimator/virtualizer remeasure triggered by the viewport resize observer must run in its own frame (rAF-scheduled), never synchronously inside the resize observer callback, which shares the long-animation-frame of the chat ingestion that resized the viewport',
    ).toBe(0)
  })
})
