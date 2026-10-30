import {afterEach, describe, expect, it, vi} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {mountToolCard} from '@conciv/extension-testkit/card-harness'
import {CardChromeProvider, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {createCaptureSession} from '../src/client/capture-session.js'
import type {RecorderConfig, RrwebEvent} from '../src/shared/protocol.js'
import {RecordingToolCard} from '../src/tool/card.js'

describe('capture session', () => {
  const config: RecorderConfig = {masking: 'none', windowMinutes: 10, console: false}

  const settle = async (): Promise<void> => {
    for (let step = 0; step < 8; step += 1) await Promise.resolve()
  }

  const setVisibility = (state: DocumentVisibilityState): void => {
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => state})
    document.dispatchEvent(new Event('visibilitychange'))
  }

  const snapshotCount = (batches: RrwebEvent[][]): number => batches.flat().filter((event) => event.type === 2).length

  describe('createCaptureSession resume race', () => {
    afterEach(() => {
      Reflect.deleteProperty(document, 'visibilityState')
      vi.useRealTimers()
    })

    it('a stop during a pending resume never re-attaches the stopped recorder', async () => {
      vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
      let releaseConfig: (value: RecorderConfig) => void = () => {}
      const sentByStopped: RrwebEvent[][] = []
      const stoppedSession = createCaptureSession({
        config,
        reloadConfig: () =>
          new Promise((resolve) => {
            releaseConfig = resolve
          }),
        send: async (events) => {
          sentByStopped.push(events)
        },
        onFailed: () => {},
      })
      setVisibility('hidden')
      vi.advanceTimersByTime(30_001)
      setVisibility('visible')
      await stoppedSession.finish()
      const flushesAfterFinish = sentByStopped.length

      const sentByNext: RrwebEvent[][] = []
      const nextSession = createCaptureSession({
        config,
        reloadConfig: () => Promise.resolve(config),
        send: async (events) => {
          sentByNext.push(events)
        },
        onFailed: () => {},
      })
      await nextSession.flushNow()
      const snapshotsBefore = snapshotCount(sentByNext)

      releaseConfig(config)
      await settle()

      nextSession.takeSnapshot()
      await nextSession.flushNow()
      expect(snapshotCount(sentByNext)).toBeGreaterThan(snapshotsBefore)
      expect(sentByStopped.length).toBe(flushesAfterFinish)
      await nextSession.finish()
    })

    it('a resume with no interleaved stop re-attaches the recorder', async () => {
      vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
      const sent: RrwebEvent[][] = []
      const session = createCaptureSession({
        config,
        reloadConfig: () => Promise.resolve(config),
        send: async (events) => {
          sent.push(events)
        },
        onFailed: () => {},
      })
      setVisibility('hidden')
      vi.advanceTimersByTime(30_001)
      setVisibility('visible')
      await settle()
      await session.flushNow()
      const snapshotsBefore = snapshotCount(sent)
      session.takeSnapshot()
      await session.flushNow()
      expect(snapshotCount(sent)).toBeGreaterThan(snapshotsBefore)
      await session.finish()
    })
  })
})

describe('recording tool card', () => {
  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  const LOG = '+0.0s [click] button "Save"\n+2.5s [navigation] /settings\n+4.1s [console] error: boom'

  describe('RecordingToolCard (real browser)', () => {
    it('recording_pull shows the window summary and the action list', async () => {
      const content = JSON.stringify([
        {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
        {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
        {type: 'text', content: LOG},
      ])
      mountToolCard(RecordingToolCard, {name: 'recording_pull', args: {secondsBack: 30, keyframes: 3}, content})
      await expect.element(page.getByText('last 30s · 3 actions · 2 keyframes')).toBeVisible()
      await page.getByRole('button', {name: /recording_pull/}).click()
      await expect.element(page.getByText('button "Save"')).toBeVisible()
      await expect.element(page.getByText('navigation')).toBeVisible()
    })

    it('recording_start shows the capture id', async () => {
      mountToolCard(RecordingToolCard, {
        name: 'recording_start',
        content: JSON.stringify({captureId: 'cap_1', startedAt: 1}),
      })
      await expect.element(page.getByText('capture started')).toBeVisible()
      await page.getByRole('button', {name: /recording_start/}).click()
      await expect.element(page.getByText('cap_1')).toBeVisible()
    })

    it('a stop error renders the error state', async () => {
      mountToolCard(RecordingToolCard, {
        name: 'recording_stop',
        args: {captureId: 'cap_9', keyframes: 0},
        content: JSON.stringify({error: 'no active capture cap_9'}),
      })
      await page.getByRole('button', {name: /recording_stop/}).click()
      await expect.element(page.getByText('no active capture cap_9')).toBeVisible()
    })

    it('shows the duration and frame summary in the body when embedded in the trace', async () => {
      const content = JSON.stringify([
        {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
        {type: 'text', content: LOG},
      ])
      render(() => (
        <CardChromeProvider value="embedded">
          <RecordingToolCard
            part={{
              type: 'tool-call',
              id: 't1',
              name: 'recording_pull',
              arguments: JSON.stringify({secondsBack: 30, keyframes: 3}),
              state: 'input-complete',
            }}
            result={{type: 'tool-result', toolCallId: 't1', content, state: 'complete'}}
            ctx={INERT_TOOL_CTX}
            addResult={() => {}}
          />
        </CardChromeProvider>
      ))

      await expect.element(page.getByText('last 30s · 3 actions · 1 keyframe', {exact: true})).toBeVisible()
    })
  })
})
