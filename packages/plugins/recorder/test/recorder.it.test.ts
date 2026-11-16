import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {z} from 'zod'
import type {Page} from 'playwright'
import {expect} from 'playwright/test'
import {test} from '@conciv/browser-fixture'
import {openPluginWidget} from '@conciv/plugin-testkit/widget-suite'
import {rpcSocketFor, type RpcSocketCall} from '@conciv/plugin-testkit/rpc-socket'

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

function isRecordingWindowRead(call: RpcSocketCall): boolean {
  return call.path.join('.') === 'plugin.call' && (JSON.stringify(call.input) ?? '').includes('"method":"window"')
}

describe('the recorder in the widget', () => {
  test('is an active plugin with a browser part, and with the old extension Recorder view hidden shows its Recorder tab loading the recording in the panel, then with nothing recorded yet for this page', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'recorder-widget',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
    })
    try {
      const page = widget.page
      const socket = rpcSocketFor(page)
      await socket.installed
      const windowRead = Promise.withResolvers<void>()
      socket.rule((call) => {
        if (!isRecordingWindowRead(call)) return 'pass'
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
    } finally {
      await widget.close()
    }
  }, 120_000)

  test('follows the recording live: an append landing after the window read and before the replay subscribes still reaches the player', async ({
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
    } finally {
      await widget.close()
    }
  }, 120_000)
})
