import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, onTestFinished, vi} from 'vitest'
import {z} from 'zod'
import type {Browser, Page} from 'playwright'
import {expect} from 'playwright/test'
import {test} from '@conciv/browser-fixture'
import {openPluginWidget, type PluginWidget} from '@conciv/plugin-testkit/widget-suite'
import {rpcSocketFor, type RpcSocket, type RpcSocketCall} from '@conciv/plugin-testkit/rpc-socket'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

const WIDGET_BUNDLE = path.join(PACKAGE_DIR, 'node_modules/@conciv/embed/dist/conciv-widget.global.js')

const RecorderCallInput = z.object({
  rpcId: z.literal('recorder'),
  method: z.string(),
  input: z.object({clientId: z.string()}),
})
const RecorderChunkInput = z.object({id: z.literal('recorder')})

function recorderMethod(call: RpcSocketCall): {method: string; clientId: string} | undefined {
  if (call.path.join('.') !== 'plugin.call') return undefined
  const parsed = RecorderCallInput.safeParse(call.input)
  return parsed.success ? {method: parsed.data.method, clientId: parsed.data.input.clientId} : undefined
}

function isRecorderChunk(call: RpcSocketCall): boolean {
  return call.path.join('.') === 'plugin.experimentalChunk' && RecorderChunkInput.safeParse(call.input).success
}

const BODY_ID = 3

function recordedPage(base: number, text: string): {type: number; data: unknown; timestamp: number}[] {
  const paragraph = {id: 4, type: 2, tagName: 'p', attributes: {}, childNodes: [{id: 5, type: 3, textContent: text}]}
  const body = {id: BODY_ID, type: 2, tagName: 'body', attributes: {}, childNodes: [paragraph]}
  const html = {id: 2, type: 2, tagName: 'html', attributes: {}, childNodes: [body]}
  return [
    {type: 4, data: {href: 'http://localhost/app', width: 800, height: 600}, timestamp: base},
    {
      type: 2,
      data: {node: {id: 1, type: 0, childNodes: [html]}, initialOffset: {left: 0, top: 0}},
      timestamp: base + 1,
    },
  ]
}

function addedParagraph(id: number, text: string): {type: number; data: unknown; timestamp: number} {
  return {
    type: 3,
    data: {
      source: 0,
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        {parentId: BODY_ID, nextId: null, node: {id, type: 2, tagName: 'p', attributes: {}, childNodes: []}},
        {parentId: id, nextId: null, node: {id: id + 1, type: 3, textContent: text}},
      ],
    },
    timestamp: Date.now(),
  }
}

function replayed(page: Page, text: string) {
  return page.frameLocator('iframe').getByText(text, {exact: true}).first()
}

async function showRecorderTab(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
  await page.getByRole('link', {name: 'Settings'}).click({timeout: 30_000})
  await page.getByRole('tab', {name: 'Views', exact: true}).click({timeout: 30_000})
  await page
    .getByRole('region', {name: 'Tab bar'})
    .getByText(/^Recorder/)
    .click()
  await expect(page.getByRole('checkbox', {name: /^Recorder/})).not.toBeChecked()
  await page.getByRole('button', {name: 'Back to chat'}).click()
  await page.getByRole('tab', {name: 'Recorder', exact: true}).click()
}

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

  test('follows the recording live: an append landing after the window read and before the replay subscribes still reaches the player, appends made while the socket was down reach it once it is back, and a failed incremental read resumes from the last good cursor on the next append', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'recorder-follow',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
    })
    try {
      const page = widget.page
      const flush = (clientId: string, events: unknown[]) =>
        widget.kit.rpc.plugin.call({rpcId: 'recorder', method: 'flush', input: {clientId, events}})
      const socket = rpcSocketFor(page)
      await socket.installed
      const seenClient = Promise.withResolvers<string>()
      const windowRead = Promise.withResolvers<void>()
      const playerChunks = Promise.withResolvers<void>()
      socket.rule((call) => {
        if (isRecorderChunk(call)) {
          void playerChunks.promise.then(() => call.forward())
          return 'handled'
        }
        const recorder = recorderMethod(call)
        if (recorder?.method !== 'window') return 'pass'
        seenClient.resolve(recorder.clientId)
        void windowRead.promise.then(() => call.forward())
        return 'handled'
      })
      await page.reload({waitUntil: 'domcontentloaded'})
      await showRecorderTab(page)
      await expect(page.getByText('Loading recording…', {exact: true})).toBeVisible({timeout: 30_000})
      const clientId = await seenClient.promise
      await flush(clientId, recordedPage(Date.now(), 'Before'))
      windowRead.resolve()
      await expect(page.getByText('Loading player…', {exact: true})).toBeVisible({timeout: 30_000})

      await flush(clientId, [addedParagraph(10, 'Between')])
      playerChunks.resolve()
      await expect(replayed(page, 'Before')).toBeAttached({timeout: 30_000})
      await expect(replayed(page, 'Between')).toBeAttached({timeout: 10_000})

      const opened = socket.opened()
      await socket.hold()
      await flush(clientId, [addedParagraph(20, 'While away')])
      socket.release()
      await expect(replayed(page, 'While away')).toBeAttached({timeout: 30_000})
      expect(socket.opened()).toBeGreaterThan(opened)

      const failedRead = Promise.withResolvers<void>()
      const stopFailing = socket.rule((call) => {
        if (recorderMethod(call)?.method !== 'since') return 'pass'
        stopFailing()
        void call.reply(500).then(() => failedRead.resolve())
        return 'handled'
      })
      await flush(clientId, [addedParagraph(30, 'Lost read')])
      await failedRead.promise
      await flush(clientId, [addedParagraph(40, 'After')])
      await expect(replayed(page, 'Lost read')).toBeAttached({timeout: 10_000})
      await expect(replayed(page, 'After')).toBeAttached({timeout: 10_000})
    } finally {
      await widget.close()
    }
  }, 120_000)
})

describe('sending a recording to the agent', () => {
  test('the user acts on the page, opens Recorder, sends the recording to the agent and lands back on the chat with a Screen recording note in the composer', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'recorder-send',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
      body: `
        <button type="button" onclick="this.textContent = 'Pressed by the user'">Press me</button>
        <button type="button" onclick="this.textContent = ['Pressed', 'while a batch is sending'].join(' ')">Press while a batch is sending</button>
        <button type="button" onclick="this.textContent = ['Pressed', 'right before the send'].join(' ')">Press right before the send</button>
      `,
    })
    try {
      const page = widget.page
      const socket = rpcSocketFor(page)
      await socket.installed
      await page.reload({waitUntil: 'domcontentloaded'})
      const notes = () => page.getByRole('list', {name: 'Notes', exact: true})
      await showRecorderTab(page)
      await expect(page.getByText('No recording yet: interact with the page first.', {exact: true})).toBeVisible({
        timeout: 30_000,
      })
      await page.getByRole('button', {name: 'Press me', exact: true}).click()
      await expect(replayed(page, 'Pressed by the user')).toBeAttached({timeout: 30_000})

      const recordingsFolder = path.join(widget.kit.stateRoot, '.conciv', 'recorder', 'recordings')
      await mkdir(path.dirname(recordingsFolder), {recursive: true})
      await writeFile(recordingsFolder, 'a file where the recordings folder belongs', 'utf8')
      await page.getByRole('button', {name: 'Send to agent', exact: true}).click()
      await expect(
        page.getByText('Could not write the recording to the project folder. Try again.', {exact: true}),
      ).toBeVisible({timeout: 30_000})
      await expect(page.getByRole('tab', {name: 'Recorder', exact: true, selected: true})).toBeVisible()
      await rm(recordingsFolder)

      socket.rule((call) => {
        if (!isRecorderCall(call, 'log')) return 'pass'
        void call.reply(500)
        return 'handled'
      })
      await page.getByRole('button', {name: 'Send to agent', exact: true}).click()
      await expect(page.getByRole('tab', {name: 'Chat', exact: true, selected: true})).toBeVisible({timeout: 30_000})
      expect((await readdir(recordingsFolder)).filter((name) => name.endsWith('.json'))).toHaveLength(1)
      await expect(page.getByRole('tab', {name: 'Recorder', exact: true, selected: false})).toBeVisible()
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
      await expect(notes().getByText('Screen recording', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(notes().getByText(/^\d+ actions? · \d+s$/)).toBeVisible()
      await expect(notes().getByRole('button', {name: 'Remove Screen recording', exact: true})).toBeVisible()

      await notes().getByRole('button', {name: 'Play', exact: true}).click()
      const replayDialog = page.getByRole('dialog', {name: 'Screen recording replay', exact: true})
      await expect(replayDialog.getByText(/^\d+ actions? · \d+s$/)).toBeVisible({timeout: 30_000})
      await expect(replayDialog.getByRole('button', {name: 'Export video', exact: true})).toBeVisible()
      const playback = replayDialog.getByRole('button', {name: 'Toggle playback', exact: true})
      await expect(playback).toBeInViewport({ratio: 1, timeout: 30_000})
      await expect(replayDialog.getByRole('slider', {name: 'Timeline', exact: true})).toBeInViewport({ratio: 1})
      await playback.click()
      await expect(
        replayDialog.frameLocator('iframe').getByRole('button', {name: 'Pressed by the user', exact: true}),
      ).toBeAttached({timeout: 30_000})
      await replayDialog.getByRole('button', {name: 'Close', exact: true}).click()
      await expect(replayDialog).toBeHidden()

      const editor = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await editor.click()
      await page.keyboard.press('Enter')
      await expect(notes()).toBeHidden({timeout: 30_000})
      const sentNotes = page.getByRole('list', {name: 'Notes on this message'})
      await expect(sentNotes.getByText('Screen recording', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(sentNotes.getByText(/^\d+ actions? · \d+s$/)).toBeVisible()
      await sentNotes.getByRole('button', {name: 'Play', exact: true}).click()
      await expect(replayDialog).toBeVisible()
      await replayDialog.getByRole('button', {name: 'Close', exact: true}).click()
      await expect(replayDialog).toBeHidden()

      await rm(recordingsFolder, {recursive: true})
      await sentNotes.getByRole('button', {name: 'Play', exact: true}).click()
      await expect(replayDialog.getByText('Recording not found: it is no longer saved in this project.')).toBeVisible({
        timeout: 30_000,
      })
      await replayDialog.getByRole('button', {name: 'Close', exact: true}).click()

      await page.getByRole('tab', {name: 'Recorder', exact: true}).click()
      const sendingBatch = Promise.withResolvers<() => void>()
      const held = {batches: 0}
      socket.rule((call) => {
        if (held.batches > 0 || !isRecorderCall(call, 'flush')) return 'pass'
        if (!carrying('Pressed while a batch is sending')(call.input)) return 'pass'
        held.batches += 1
        sendingBatch.resolve(call.forward)
        return 'handled'
      })
      await page.getByRole('button', {name: 'Press while a batch is sending', exact: true}).click()
      const deliverSendingBatch = await sendingBatch.promise
      await page.getByRole('button', {name: 'Press right before the send', exact: true}).click()
      await page.getByRole('button', {name: 'Send to agent', exact: true}).click()
      deliverSendingBatch()
      await expect(page.getByRole('tab', {name: 'Chat', exact: true, selected: true})).toBeVisible({timeout: 30_000})
      const [lastSaved] = (await readdir(recordingsFolder)).filter((name) => name.endsWith('.json'))
      if (lastSaved === undefined) throw new Error('the send saved no recording')
      const savedRecording = await readFile(path.join(recordingsFolder, lastSaved), 'utf8')
      expect(savedRecording.includes('Pressed right before the send'), 'the saved recording holds the last click').toBe(
        true,
      )
    } finally {
      await widget.close()
    }
  }, 120_000)
})

const RecordedEventSchema = z.object({type: z.number(), data: z.unknown(), timestamp: z.number()})
const EventWindowSchema = z.object({events: z.array(RecordedEventSchema), cursor: z.number()})
const LogSchema = z.object({entries: z.array(z.object({kind: z.string(), detail: z.string()}))})
const FlushCallSchema = z.object({
  rpcId: z.literal('recorder'),
  method: z.literal('flush'),
  input: z.object({clientId: z.string(), events: z.array(RecordedEventSchema)}),
})

type RecorderPage = {widget: PluginWidget; page: Page; socket: RpcSocket}

async function openRecorderPage(
  browser: Browser,
  opts: {id: string; body: string; clock?: boolean},
): Promise<RecorderPage> {
  const widget = await openPluginWidget(browser, {
    id: opts.id,
    plugins: [PACKAGE_DIR],
    widgetBundle: WIDGET_BUNDLE,
    body: opts.body,
  })
  onTestFinished(() => widget.close())
  const page = widget.page
  const socket = rpcSocketFor(page)
  await socket.installed
  if (opts.clock) await page.clock.install()
  const stateAnswered = recorderCallAnswered(socket, 'state')
  await page.reload({waitUntil: 'domcontentloaded'})
  await stateAnswered
  return {widget, page, socket}
}

function callRecorder(widget: PluginWidget, method: string, input: unknown = {}): Promise<unknown> {
  return widget.kit.rpc.plugin.call({rpcId: 'recorder', method, input})
}

async function startRecording(widget: PluginWidget): Promise<string> {
  return StartedSchema.parse(await widget.kit.callTool('recording_start', {})).captureId
}

async function stopRecording(widget: PluginWidget, captureId: string): Promise<string> {
  return z.string().parse(await widget.kit.callTool('recording_stop', {captureId, keyframes: 0}))
}

function recorderReply(socket: RpcSocket, method: string, matches: (input: unknown) => boolean): Promise<number> {
  const asked = Promise.withResolvers<string>()
  const answered = Promise.withResolvers<number>()
  const stopListening = socket.listen((event) => {
    if (event.kind === 'request' && isRecorderCall(event, method) && matches(event.input)) {
      asked.resolve(event.requestId)
    }
    if (event.kind !== 'response') return
    void asked.promise.then((requestId) => {
      if (requestId === event.requestId) answered.resolve(event.status)
    })
  })
  return answered.promise.finally(stopListening)
}

function anyInput(): boolean {
  return true
}

function carrying(text: string): (input: unknown) => boolean {
  return (input) => (JSON.stringify(input) ?? '').includes(text)
}

function carryingFullSnapshot(input: unknown): boolean {
  return FlushCallSchema.safeParse(input).data?.input.events.some((event) => event.type === 2) ?? false
}

function watchFlushes(socket: RpcSocket): {count: () => number; clientId: () => string} {
  const clients: string[] = []
  socket.listen((event) => {
    if (event.kind !== 'request' || event.path.join('.') !== 'plugin.call') return
    const flush = FlushCallSchema.safeParse(event.input)
    if (flush.success) clients.push(flush.data.input.clientId)
  })
  return {
    count: () => clients.length,
    clientId: () => {
      const latest = clients.at(-1)
      if (latest === undefined) throw new Error('the page has not flushed a recording yet')
      return latest
    },
  }
}

async function recordedLog(widget: PluginWidget, clientId: string): Promise<string[]> {
  return LogSchema.parse(await callRecorder(widget, 'log', {clientId})).entries.map((entry) => entry.detail)
}

async function setVisibility(page: Page, state: DocumentVisibilityState): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => next})
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

const HIDDEN_PAUSE_PASSED_MS = 30_001

const CAPTURE_BODY = `
  <button type="button" onclick="this.textContent = 'Pressed while idle'">Press while idle</button>
  <button type="button" onclick="this.textContent = 'Pressed by the user'">Press me</button>
  <button type="button" onclick="this.textContent = 'Pressed after the stop'">Press after the stop</button>
  <button type="button" onclick="this.textContent = 'Pressed after the run'">Press after the run</button>
  <label>Fixture input <input type="text"></label>
  <script>window.fixtureScript = 'FIXTURE_SCRIPT_BODY'</script>
  <style data-conciv-fonts>/* CONCIV_FONT_FIXTURE ${'y'.repeat(600_000)} */</style>
`

describe('the page capture', () => {
  test('captures nothing while idle, records a real click and typing right after recording_start into the marked log and the pulled log, strips script bodies and conciv styles from the recording, samples typing to its last value, goes quiet after recording_stop, and keeps a recording live across a finished agent run', async ({
    browser,
  }) => {
    const {widget, page, socket} = await openRecorderPage(browser, {id: 'recorder-capture', body: CAPTURE_BODY})
    const flushes = watchFlushes(socket)

    await page.getByRole('button', {name: 'Press while idle', exact: true}).click()
    await expect(page.getByRole('button', {name: 'Pressed while idle', exact: true})).toBeVisible()
    expect(await widget.kit.callTool('recording_pull', {secondsBack: 120, keyframes: 0})).toBe(
      'No recorded activity in this window.',
    )
    expect(flushes.count()).toBe(0)

    const captureId = await startRecording(widget)
    await page.getByRole('button', {name: 'Press me', exact: true}).click()
    const field = page.getByRole('textbox', {name: 'Fixture input'})
    await field.click()
    await field.pressSequentially('sampling')
    await field.press('Tab')
    const stopped = await stopRecording(widget, captureId)
    expect(stopped).toContain('[click] clicked button "Press me"')
    expect(flushes.count()).toBeGreaterThan(0)
    const pulled = z.string().parse(await widget.kit.callTool('recording_pull', {secondsBack: 120, keyframes: 0}))
    expect(pulled).toContain('[click] clicked button "Press me"')

    const clientId = flushes.clientId()
    const recorded = EventWindowSchema.parse(await callRecorder(widget, 'window', {clientId})).events
    const stored = JSON.stringify(recorded)
    expect(stored).toContain('Press me')
    expect(stored).not.toContain('FIXTURE_SCRIPT_BODY')
    expect(stored).not.toContain('CONCIV_FONT_FIXTURE')
    expect(Math.max(...recorded.map((event) => JSON.stringify(event).length))).toBeLessThan(500_000)
    expect(stored).toContain('sampling')
    expect(recorded.filter((event) => JSON.stringify(event).includes('"text":"s')).length).toBeLessThan(4)

    await page.getByRole('button', {name: 'Press after the stop', exact: true}).click()
    await expect(page.getByRole('button', {name: 'Pressed after the stop', exact: true})).toBeVisible()
    const afterRun = await startRecording(widget)
    await (await widget.kit.chat('hello')).done()
    await page.getByRole('button', {name: 'Press after the run', exact: true}).click()
    expect(await stopRecording(widget, afterRun)).toContain('[click] clicked button "Press after the run"')

    const log = await recordedLog(widget, clientId)
    expect(log).toContain('clicked button "Press me"')
    expect(log.filter((detail) => detail.includes('idle') || detail.includes('after the stop'))).toEqual([])
  }, 120_000)
})

describe('the page capture across a hidden page', () => {
  test('pauses capture while the page stays hidden and records again once it is visible, and a recording stopped while the resume still reads its config never attaches a second recorder beside the next one', async ({
    browser,
  }) => {
    const {widget, page, socket} = await openRecorderPage(browser, {
      id: 'recorder-hidden',
      body: '<button type="button">Press me</button><button type="button">Press again</button>',
      clock: true,
    })
    const flushes = watchFlushes(socket)

    const resumed = await startRecording(widget)
    await setVisibility(page, 'hidden')
    await page.clock.fastForward(HIDDEN_PAUSE_PASSED_MS)
    const resumedSnapshot = recorderReply(socket, 'flush', carryingFullSnapshot)
    await setVisibility(page, 'visible')
    expect(await resumedSnapshot).toBe(200)
    await page.getByRole('button', {name: 'Press me', exact: true}).click()
    await stopRecording(widget, resumed)
    expect(await recordedLog(widget, flushes.clientId())).toContain('clicked button "Press me"')

    const interrupted = await startRecording(widget)
    await setVisibility(page, 'hidden')
    await page.clock.fastForward(HIDDEN_PAUSE_PASSED_MS)
    const staleRead = recorderReply(socket, 'config', anyInput)
    const resumeHeld = Promise.withResolvers<RpcSocketCall>()
    const stopHolding = socket.rule((call) => {
      if (!isRecorderCall(call, 'config')) return 'pass'
      stopHolding()
      resumeHeld.resolve(call)
      return 'handled'
    })
    await setVisibility(page, 'visible')
    const resumeRead = await resumeHeld.promise
    await stopRecording(widget, interrupted)
    const next = await startRecording(widget)
    resumeRead.forward()
    expect(await staleRead).toBe(200)
    await widget.kit.callTool('recording_pull', {secondsBack: 120, keyframes: 0})
    await page.getByRole('button', {name: 'Press again', exact: true}).click()
    await stopRecording(widget, next)
    const log = await recordedLog(widget, flushes.clientId())
    expect(log.filter((detail) => detail === 'clicked button "Press again"')).toEqual(['clicked button "Press again"'])
  }, 120_000)
})

describe('the page capture under queued controls', () => {
  test('finishes the session of a stop that a newer start overtook while its config read was held, and keeps the events of a failed flush across a stop and a new start, in order', async ({
    browser,
  }) => {
    const {widget, page, socket} = await openRecorderPage(browser, {
      id: 'recorder-queued',
      body: ['first', 'second', 'third']
        .map((label) => `<button type="button" onclick="this.textContent = 'Pressed ${label}'">Press ${label}</button>`)
        .join(''),
    })
    const flushes = watchFlushes(socket)
    const presence = (live: boolean) => callRecorder(widget, 'presence', {viewerId: 'queued', live})

    const configReads: RpcSocketCall[] = []
    const reads = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    const released = Promise.withResolvers<void>()
    const stopHolding = socket.rule((call) => {
      if (!isRecorderCall(call, 'config')) return 'pass'
      configReads.push(call)
      reads[configReads.length - 1]?.resolve()
      void released.promise.then(() => call.forward())
      return 'handled'
    })
    await presence(true)
    await reads[0]?.promise
    await presence(false)
    await presence(true)
    await reads[1]?.promise
    stopHolding()
    released.resolve()
    const firstSent = recorderReply(socket, 'flush', carrying('Pressed first'))
    await page.getByRole('button', {name: 'Press first', exact: true}).click()
    expect(await firstSent).toBe(200)
    expect(configReads).toHaveLength(2)
    const clientId = flushes.clientId()
    expect(JSON.stringify(await callRecorder(widget, 'window', {clientId}))).toContain('Pressed first')

    const stopFailing = socket.rule((call) => {
      if (recorderMethod(call)?.method !== 'flush') return 'pass'
      void call.reply(500)
      return 'handled'
    })
    const secondFailed = recorderReply(socket, 'flush', carrying('Pressed second'))
    await page.getByRole('button', {name: 'Press second', exact: true}).click()
    expect(await secondFailed).toBe(500)
    const restarted = recorderReply(socket, 'config', anyInput)
    await presence(false)
    await presence(true)
    expect(await restarted).toBe(200)
    stopFailing()
    const thirdSent = recorderReply(socket, 'flush', carrying('Pressed third'))
    await page.getByRole('button', {name: 'Press third', exact: true}).click()
    expect(await thirdSent).toBe(200)
    const recorded = EventWindowSchema.parse(await callRecorder(widget, 'window', {clientId})).events
    const mutationIndex = (text: string) =>
      recorded.findIndex((event) => event.type === 3 && JSON.stringify(event).includes(text))
    expect(mutationIndex('Pressed second')).toBeGreaterThanOrEqual(0)
    expect(mutationIndex('Pressed second')).toBeLessThan(mutationIndex('Pressed third'))
    await presence(false)
  }, 120_000)
})

const PRESS_COUNTER_BODY =
  '<button type="button" onclick="document.querySelector(\'output\').textContent = \'Pressed \' + (++window.presses)">Press me</button><output>Not pressed</output><script>window.presses = 0</script>'

const AWAY_MS = 60_000

describe('the replay in the Recorder tab', () => {
  test('streams live with the LIVE badge and a labelled controller, follows new page activity, leaves the live edge on a scrub and returns with GO LIVE, detaches on pause and catches up on play, all without a write into a Solid store', async ({
    browser,
  }) => {
    const {page} = await openRecorderPage(browser, {id: 'recorder-replay', body: PRESS_COUNTER_BODY, clock: true})
    const storeWrites: string[] = []
    page.on('console', (message) => {
      if (message.text().includes('Cannot mutate a Store')) storeWrites.push(message.text())
    })
    const press = async (count: number): Promise<void> => {
      await page.getByRole('button', {name: 'Press me', exact: true}).click()
      await expect(page.getByText(`Pressed ${count}`, {exact: true})).toBeVisible()
    }
    const live = page.getByText('LIVE', {exact: true})
    const goLive = page.getByRole('button', {name: 'GO LIVE', exact: true})
    const playback = page.getByRole('button', {name: 'Toggle playback'})
    const timeline = page.getByRole('slider', {name: 'Timeline'})

    await showRecorderTab(page)
    await expect(replayed(page, 'Not pressed')).toBeAttached({timeout: 30_000})
    await expect(live).toBeVisible({timeout: 10_000})
    await expect(playback).toBeVisible()
    await expect(page.getByRole('button', {name: 'Toggle fullscreen'})).toBeVisible()
    await expect(timeline).toBeVisible()

    await press(1)
    await expect(replayed(page, 'Pressed 1')).toBeAttached({timeout: 30_000})
    await press(2)
    await expect(replayed(page, 'Pressed 2')).toBeAttached({timeout: 30_000})

    await page.clock.fastForward(AWAY_MS)
    await press(3)
    await expect(replayed(page, 'Pressed 3')).toBeAttached({timeout: 30_000})
    await expect(live).toBeVisible()
    await timeline.click()
    await page.keyboard.press('ArrowLeft')
    await expect(goLive).toBeVisible({timeout: 10_000})
    await expect(replayed(page, 'Pressed 3')).toHaveCount(0)
    await goLive.click()
    await expect(live).toBeVisible({timeout: 10_000})
    await expect(replayed(page, 'Pressed 3')).toBeAttached({timeout: 30_000})

    await playback.click()
    await expect(goLive).toBeVisible({timeout: 10_000})
    const lengthBefore = await timeline.getAttribute('aria-valuemax')
    if (lengthBefore === null) throw new Error('the Timeline slider has no length')
    await press(4)
    await expect(timeline).not.toHaveAttribute('aria-valuemax', lengthBefore, {timeout: 30_000})
    await expect(replayed(page, 'Pressed 4')).toHaveCount(0)
    await playback.click()
    await expect(replayed(page, 'Pressed 4')).toBeAttached({timeout: 30_000})
    await expect(live).toBeVisible({timeout: 10_000})
    expect(storeWrites).toEqual([])
  }, 120_000)
})

const RecorderChunkFileInput = z.object({file: z.string()})

function isChunk(call: RpcSocketCall, prefix: string): boolean {
  const parsed = RecorderChunkFileInput.safeParse(call.input)
  return isRecorderChunk(call) && parsed.success && parsed.data.file.startsWith(prefix)
}

describe('the page capture behind a slow capture library', () => {
  test('answers a start that outlasts the page attach deadline as unattached, and records a later start once the library has loaded', async ({
    browser,
  }) => {
    const {widget, page, socket} = await openRecorderPage(browser, {
      id: 'recorder-slow-library',
      body: '<button type="button" onclick="this.textContent = \'Pressed by the user\'">Press me</button>',
    })
    const libraryRequested = Promise.withResolvers<void>()
    const libraryReleased = Promise.withResolvers<void>()
    const stopHolding = socket.rule((call) => {
      if (!isChunk(call, 'rrweb-') || isChunk(call, 'rrweb-player-')) return 'pass'
      libraryRequested.resolve()
      void libraryReleased.promise.then(() => call.forward())
      return 'handled'
    })
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true})
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const timedOut = widget.kit.callTool('recording_start', {}).then(
      () => 'the start answered',
      (error: unknown) => String(error),
    )
    await libraryRequested.promise
    await vi.advanceTimersByTimeAsync(5000)
    expect(await timedOut).toContain('no page client attached within 5s')
    vi.useRealTimers()

    stopHolding()
    libraryReleased.resolve()
    const captureId = await startRecording(widget)
    await page.getByRole('button', {name: 'Press me', exact: true}).click()
    await expect(page.getByRole('button', {name: 'Pressed by the user', exact: true})).toBeVisible()
    expect(await stopRecording(widget, captureId)).toContain('[click] clicked button "Press me"')
  }, 120_000)
})

describe('the Recorder tab when a page library fails to load', () => {
  test('tells the user that recording is unavailable when the capture library fails to load', async ({browser}) => {
    const {page, socket} = await openRecorderPage(browser, {id: 'recorder-capture-failed', body: '<p>Fixture</p>'})
    socket.rule((call) => {
      if (!isChunk(call, 'rrweb-plugin-console-record-')) return 'pass'
      void call.reply(500)
      return 'handled'
    })
    await showRecorderTab(page)
    await expect(
      page.getByText('Recording is unavailable: capture failed to start on this page.', {exact: true}),
    ).toBeVisible({timeout: 30_000})
  }, 120_000)

  test('tells the user that the player could not load with a Retry, and Retry replays the page once the player loads', async ({
    browser,
  }) => {
    const {page, socket} = await openRecorderPage(browser, {
      id: 'recorder-player-failed',
      body: '<p>Recorded fixture</p>',
    })
    const stopFailing = socket.rule((call) => {
      if (!isChunk(call, 'rrweb-player-')) return 'pass'
      void call.reply(500)
      return 'handled'
    })
    await showRecorderTab(page)
    const failure = page.getByRole('alert').filter({hasText: 'Could not load the player.'})
    await expect(failure).toBeVisible({timeout: 30_000})
    stopFailing()
    const reloaded = page.waitForEvent('domcontentloaded')
    await failure.getByRole('button', {name: 'Retry', exact: true}).click()
    await reloaded
    await page.getByRole('tab', {name: 'Recorder', exact: true}).click({timeout: 30_000})
    await expect(replayed(page, 'Recorded fixture')).toBeAttached({timeout: 30_000})
    await expect(page.getByText('Could not load the player.', {exact: true})).toHaveCount(0)
  }, 120_000)
})
