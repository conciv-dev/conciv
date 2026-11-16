import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {expect} from 'playwright/test'
import {z} from 'zod'
import {test} from '@conciv/browser-fixture'
import {openPluginWidget} from '@conciv/plugin-testkit/widget-suite'
import {rpcSocketFor, type RpcSocket} from '@conciv/plugin-testkit/rpc-socket'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

const WIDGET_BUNDLE = path.join(PACKAGE_DIR, 'node_modules/@conciv/embed/dist/conciv-widget.global.js')

const ControlEventSchema = z.object({
  type: z.literal('rpc.recorder.control'),
  data: z.object({live: z.boolean().optional()}),
})
const StartedSchema = z.object({captureId: z.string()})

function isRecorderCall(call: {readonly path: readonly string[]; readonly input: unknown}, method: string): boolean {
  return call.path.join('.') === 'plugin.call' && (JSON.stringify(call.input) ?? '').includes(`"method":"${method}"`)
}

async function recorderCallAnswered(socket: RpcSocket, method: string): Promise<void> {
  const asked = Promise.withResolvers<string>()
  const answered = Promise.withResolvers<void>()
  const stopListening = socket.listen((event) => {
    if (event.kind === 'request' && isRecorderCall(event, method)) asked.resolve(event.requestId)
    if (event.kind !== 'response') return
    void asked.promise.then((requestId) => {
      if (requestId === event.requestId) answered.resolve()
    })
  })
  await answered.promise
  stopListening()
}

async function untilRecordingGoesLive(events: AsyncIterable<unknown>): Promise<void> {
  for await (const event of events) {
    if (ControlEventSchema.safeParse(event).data?.data.live === true) return
  }
  throw new Error('the recorder event stream ended before the recording went live')
}

describe('the recorder in the widget', () => {
  test('is an active plugin with a browser part, and with the old extension Recorder view hidden shows its Recorder tab loading the recording in the panel, then with nothing recorded yet for this page, then replays what the user does in the page without the widget, and records for a recording the agent started while the page was offline', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'recorder-widget',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
      body: '<button type="button" onclick="this.textContent = \'Pressed by the user\'">Press me</button>',
    })
    try {
      const page = widget.page
      const socket = rpcSocketFor(page)
      await socket.installed
      const stateAnswered = recorderCallAnswered(socket, 'state')
      await page.reload({waitUntil: 'domcontentloaded'})
      await stateAnswered
      const following = new AbortController()
      const controls = await widget.kit.rpc.event.subscribe(
        {types: ['rpc.recorder.control']},
        {signal: following.signal},
      )
      await socket.hold()
      const starting = widget.kit.callTool('recording_start', {})
      await untilRecordingGoesLive(controls)
      following.abort()
      socket.release()
      const started = StartedSchema.parse(await starting)
      await widget.kit.callTool('recording_stop', {captureId: started.captureId, keyframes: 0})
      const windowRead = Promise.withResolvers<void>()
      socket.rule((call) => {
        if (!isRecorderCall(call, 'window')) return 'pass'
        void windowRead.promise.then(() => call.forward())
        return 'handled'
      })
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
      await page.getByRole('link', {name: 'Settings'}).click({timeout: 30_000})
      await page.getByRole('tab', {name: 'Plugins', exact: true}).click({timeout: 30_000})
      await expect(page.getByRole('switch', {name: 'recorder'})).toBeChecked({timeout: 30_000})
      await expect(page.getByText('Server', {exact: true})).toBeVisible({timeout: 30_000})
      await page.getByRole('tab', {name: 'Views', exact: true}).click()
      const oldRecorderView = page.getByRole('checkbox', {name: /^Recorder/})
      await page
        .getByRole('region', {name: 'Tab bar'})
        .getByText(/^Recorder/)
        .click()
      await expect(oldRecorderView).not.toBeChecked()
      await page.getByRole('button', {name: 'Back to chat'}).click()
      const recorderTab = page.getByRole('tab', {name: 'Recorder', exact: true})
      await recorderTab.click()
      await expect(page.getByRole('tab', {name: 'Recorder', exact: true, selected: true})).toBeVisible()
      await expect(page.getByText('Loading recording…', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(page.getByText('Reconnecting to your workspace.', {exact: true})).toBeHidden()
      windowRead.resolve()
      await expect(page.getByText('No recording yet: interact with the page first.', {exact: true})).toBeVisible({
        timeout: 30_000,
      })
      await page.getByRole('button', {name: 'Press me', exact: true}).click()
      await expect(page.getByRole('button', {name: 'Pressed by the user', exact: true})).toBeVisible()
      const replay = page.frameLocator('iframe')
      await expect(replay.getByRole('button', {name: 'Pressed by the user', exact: true})).toBeAttached({
        timeout: 30_000,
      })
      await expect(replay.getByRole('tab', {name: 'Recorder', exact: true})).toHaveCount(0)
    } finally {
      await widget.close()
    }
  }, 120_000)
})
