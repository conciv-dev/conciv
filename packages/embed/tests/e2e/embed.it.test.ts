import {expect, test, type Locator, type Page} from '@playwright/test'
import {
  bootEmbedKit,
  type EmbedKit,
  hostPage,
  openPanel,
  sendMessage,
  setupWidgetSuite,
  openPanelOnNewSession,
  untilPanelDraft,
  setupProxiedEmbedSuite,
  handleHostPage,
  mountHandle,
  remountHandle,
  unmountHandle,
  chatBox,
  openChatPanel,
  sendChatMessage,
  reserveDeadPort,
  proxyTo,
  type ProxyCore,
  type WidgetSuite,
  openPagePlaneHost,
  captureNativePosts,
  installNativeStub,
  type NativeBridge,
  switchToSessionByTitle,
  openHostWithHandle,
  rebindHandle,
  chatLog,
} from '../helpers.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {currentHref} from '@conciv/extension-testkit/navigation-state'
import {until} from '@conciv/harness-testkit/until'
import {GRAB_MIME, parseGrabPayload, type GrabPayload} from '@conciv/grab/grab-attachment'
import {watchChatWire} from '@conciv/extension-testkit/chat-wire'
import recorderServer, {type RecorderRouter} from '@conciv/extension-recorder'
import type {SessionCaptures} from '@conciv/protocol/element-capture-types'
import {holdRpcCalls} from '@conciv/extension-testkit/rpc-fault'
import {fileURLToPath} from 'node:url'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import type {PageToNativeMessage} from '@conciv/extension-ios/bridge'
import {Buffer} from 'node:buffer'
import type {DraftRow} from '@conciv/contract'
import {abortCalls, awaitCompletedCall, failCalls, gateCalls} from '@conciv/extension-testkit/devframe-faults'
import {z} from 'zod'
import {completeConnectHandshake} from '@conciv/extension-testkit/connect-handshake'
import {makeExtRpcClient} from '@conciv/extension'

const SESSIONS_LIST_CALL = 'conciv:sessions:list'
const ENGINE_PROBE_CALL = 'conciv:meta:engine'
const MODELS_CALL = 'conciv:meta:models'

test.describe('embed boot', () => {
  const ASSISTANT_TEXT = 'Hello from conciv'
  const PHONE_VIEWPORT = {width: 393, height: 800}

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit({text: ASSISTANT_TEXT})
    host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
  })

  test.afterEach(async () => {
    await host.close()
    await kit.cleanup()
  })

  async function openPage(page: Page): Promise<Page> {
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    return page
  }

  test.describe('embed boots the conciv app against a real core', () => {
    test('a reload restores the panel open on the same view', async ({page, context}) => {
      test.setTimeout(180_000)
      const first = await openPage(page)
      await openPanel(first)
      await first.getByRole('tab', {name: 'Terminal'}).click()
      await until(async () => (await currentHref(kit)).includes('/terminal'), {hangGuardMs: 30_000, intervalMs: 100})
      expect(await currentHref(kit)).toMatch(/\/terminal\?.*open=true/)
      await first.close()
      const second = await openPage(await context.newPage())
      await expect(second.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(second.getByRole('tab', {name: 'Terminal'})).toHaveAttribute('aria-selected', 'true', {
        timeout: 30_000,
      })
    })

    test('a reload after closing the panel boots shut', async ({page, context}) => {
      test.setTimeout(180_000)
      const first = await openPage(page)
      await openPanel(first)
      await until(async () => (await currentHref(kit)).includes('open=true'), {hangGuardMs: 30_000, intervalMs: 100})
      expect(await currentHref(kit)).toContain('open=true')
      await first.getByRole('button', {name: 'Minimize conciv chat'}).click()
      await until(async () => !(await currentHref(kit)).includes('open=true'), {hangGuardMs: 30_000, intervalMs: 100})
      expect(await currentHref(kit)).not.toContain('open=true')
      await first.close()
      const second = await openPage(await context.newPage())
      await expect(second.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
      expect(await second.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(0)
    })

    test('sends a message and renders the assistant reply from the fake harness', async ({page}) => {
      test.setTimeout(120_000)
      await openPage(page)
      await openPanel(page)
      await sendMessage(page, 'hi there', ASSISTANT_TEXT)
    })
  })

  test.describe('embed at a phone viewport', () => {
    test.use({viewport: PHONE_VIEWPORT})

    test('opens as a full-screen sheet with the launcher hidden and the composer reachable', async ({page}) => {
      test.setTimeout(240_000)
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await openPanel(page)
      await expect(page.getByRole('button', {name: 'Open conciv chat'})).toHaveCount(0, {timeout: 30_000})
      await sendMessage(page, 'hi there', ASSISTANT_TEXT)
      await page.getByRole('button', {name: 'Close chat'}).click()
      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
      await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
    })
  })

  test.describe('embed settings', () => {
    test('modal disabled renders no fab', async ({page}) => {
      const disabledHost = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"modal": false}'}))
      await page.goto(disabledHost.base, {waitUntil: 'domcontentloaded'})
      await page.getByRole('status').waitFor({state: 'attached', timeout: 15_000})
      expect(await page.getByRole('button', {name: 'Open conciv chat'}).count()).toBe(0)
      await disabledHost.close()
    })
  })
})

test.describe('composer rich input', () => {
  const ASSISTANT_TEXT = 'Rich input reply'

  const suite = setupWidgetSuite({
    text: ASSISTANT_TEXT,
    extensions: [recorderServer],
    commands: [
      {name: 'compact', description: 'Compact the conversation'},
      {name: 'config', description: 'Open configuration'},
    ],
  })

  const composer = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const panel = (page: Page) => page.getByRole('dialog', {name: 'conciv chat agent'})

  const waitForDraftWrite = (sessionId: string, fragment: string) =>
    untilPanelDraft(suite.kit(), sessionId, (draft) => draft.text.includes(fragment))

  async function openComposer(page: Page): Promise<string> {
    const sessionId = await openPanelOnNewSession(page, suite)
    const input = composer(page)
    await input.click()
    await expect(input).toHaveText('')
    return sessionId
  }

  async function pickSuggestion(page: Page, listName: string, optionName: string): Promise<void> {
    const listbox = page.getByRole('listbox', {name: listName})
    const option = listbox.getByRole('option', {name: optionName})
    await expect(option).toBeVisible({timeout: 10_000})
    await expect(option).toHaveAttribute('id', /.+/, {timeout: 10_000})
    const optionId = await option.getAttribute('id')
    if (!optionId) throw new Error(`option "${optionName}" in "${listName}" rendered without an id`)
    await expect(composer(page)).toHaveAttribute('aria-activedescendant', optionId, {timeout: 10_000})
    await page.keyboard.press('Enter')
    await expect(listbox).toBeHidden({timeout: 10_000})
  }

  test.describe('the rich composer input in the live widget shadow DOM', () => {
    test('types multiline text with slash and mention chips and submits the exact directive string', async ({
      page: fixturePage,
    }) => {
      test.setTimeout(180_000)
      const page = fixturePage
      const wire = watchChatWire(page)
      await openComposer(page)
      const input = composer(page)

      await input.pressSequentially('please run ')
      await input.pressSequentially('/config')
      await pickSuggestion(page, 'Commands', '/config')

      await input.pressSequentially('then ')
      await input.pressSequentially('@recording_start')
      await pickSuggestion(page, 'Tools', '@recording_start')

      await page.keyboard.press('Shift+Enter')
      await input.pressSequentially('second line')

      const expected = 'please run /config then @recording_start \nsecond line'
      const sent = wire.nextTurn().then((turn) => turn.content)
      await page.getByRole('button', {name: 'Send message'}).click()
      expect(await sent).toBe(expected)
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
      await expect(input).toHaveText('')
    })

    test('backspace removes a selected command chip in two steps, never a partial directive', async ({page}) => {
      test.setTimeout(120_000)
      await openComposer(page)
      const input = composer(page)

      await input.pressSequentially('/compact')
      await pickSuggestion(page, 'Commands', '/compact')
      await expect(input).toHaveText('/compact ')

      await page.keyboard.press('Backspace')
      await expect(input).toHaveText('/compact')

      await page.keyboard.press('Backspace')
      await expect(input).toHaveText('')
    })

    test('Escape closes the typeahead first, cancels the run next, and closes the panel last', async ({page}) => {
      test.setTimeout(180_000)
      await openComposer(page)
      const input = composer(page)

      suite.kit().harness.script.hold()
      try {
        await input.pressSequentially('keep this running')
        await page.getByRole('button', {name: 'Send message'}).click()
        const stop = page.getByRole('button', {name: 'Stop generating'})
        await expect(stop).toBeVisible({timeout: 30_000})

        await input.click()
        await input.pressSequentially('/config')
        const listbox = page.getByRole('listbox', {name: 'Commands'})
        await expect(listbox.getByRole('option', {name: '/config'})).toBeVisible({timeout: 10_000})

        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({timeout: 10_000})
        await expect(input).toHaveText('/config')
        await expect(stop).toBeVisible()
        await expect(panel(page)).toBeVisible()

        await page.keyboard.press('Escape')
        await expect(stop).toBeHidden({timeout: 30_000})
        await expect(panel(page)).toBeVisible()
      } finally {
        suite.kit().harness.script.release()
      }

      await page.keyboard.press('Escape')
      await expect(panel(page)).toBeHidden({timeout: 30_000})
    })

    test('a reload restores the caret where the draft left it, not at the end', async ({page}) => {
      test.setTimeout(90_000)
      const sessionId = await openComposer(page)
      const input = composer(page)

      await input.pressSequentially('hello world')
      await waitForDraftWrite(sessionId, 'hello world')
      await expect(input).toBeFocused()
      for (let step = 0; step < 6; step += 1) await page.keyboard.press('ArrowLeft')
      await input.pressSequentially('X')
      await expect(input).toHaveText('helloX world')
      await waitForDraftWrite(sessionId, 'helloX world')

      await page.reload({waitUntil: 'domcontentloaded'})
      const restored = composer(page)
      await expect(restored).toHaveText('helloX world', {timeout: 30_000})
      await expect(restored).toBeFocused()

      await page.keyboard.type('Y')
      await expect(restored).toHaveText('helloXY world')
    })

    test('Enter during IME composition never submits; Enter after the commit sends the composed text', async ({
      page: fixturePage,
    }) => {
      test.setTimeout(90_000)
      const page = fixturePage
      const wire = watchChatWire(page)
      await openComposer(page)
      const input = composer(page)
      const cdp = await page.context().newCDPSession(page)

      await input.pressSequentially('hello')
      await cdp.send('Input.imeSetComposition', {text: 'ん', selectionStart: 1, selectionEnd: 1})
      await page.keyboard.press('Enter')
      await expect(input).toHaveText(/hello/)

      await cdp.send('Input.insertText', {text: 'ん'})
      await expect(input).toHaveText('helloん')
      const sent = wire.nextTurn().then((turn) => turn.content)
      await page.keyboard.press('Enter')
      expect(await sent).toBe('helloん')

      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
      await expect(page.getByText('helloん', {exact: true})).toBeVisible()
    })
  })
})

test.describe('composer trigger menu', () => {
  const suite = setupWidgetSuite({
    text: 'Trigger menu reply',
    commands: [
      {name: 'compact', description: 'Compact the conversation'},
      {name: 'config', description: 'Open configuration'},
      {name: 'mcp__probe__connect', description: 'Connect the probe server'},
      {name: 'plugins:codeowners', description: 'List the code owners'},
    ],
  })

  const composer = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const commandMenu = (page: Page) => page.getByRole('listbox', {name: 'Commands'})

  async function openComposer(page: Page): Promise<void> {
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    const input = composer(page)
    await input.click()
    await expect(input).toHaveText('')
  }

  async function expectActiveOption(page: Page, option: Locator): Promise<void> {
    await expect(option).toBeVisible({timeout: 10_000})
    await expect(option).toHaveAttribute('id', /.+/, {timeout: 10_000})
    const optionId = await option.getAttribute('id')
    if (!optionId) throw new Error('the highlighted option rendered without an id')
    await expect(composer(page)).toHaveAttribute('aria-activedescendant', optionId, {timeout: 10_000})
  }

  test.describe('the composer trigger menu inside the live widget panel', () => {
    test('groups commands by source with a visible header and a description per command', async ({page}) => {
      test.setTimeout(90_000)
      await openComposer(page)
      await composer(page).pressSequentially('/co')

      const menu = commandMenu(page)
      await expect(menu.getByRole('option', {name: '/compact'})).toBeVisible({timeout: 10_000})
      await expect(menu.getByRole('group', {name: 'Commands'})).toBeVisible()
      await expect(menu.getByRole('group', {name: 'MCP'})).toBeVisible()
      await expect(menu.getByRole('group', {name: 'Plugins'})).toBeVisible()
      await expect(menu.getByRole('option', {name: '/compact'})).toHaveAccessibleDescription('Compact the conversation')
      await expect(menu.getByRole('option', {name: '/mcp__probe__connect'})).toHaveAccessibleDescription(
        'Connect the probe server',
      )
      await expect(menu.getByText('Compact the conversation')).toBeVisible()
    })

    test('moves the highlight with the arrow keys and commits the highlighted command with Enter', async ({page}) => {
      test.setTimeout(240_000)
      await openComposer(page)
      const input = composer(page)
      await input.pressSequentially('/co')

      const menu = commandMenu(page)
      await expectActiveOption(page, menu.getByRole('option', {name: '/compact'}))
      await page.keyboard.press('ArrowDown')
      await expectActiveOption(page, menu.getByRole('option', {name: '/config'}))
      await page.keyboard.press('ArrowDown')
      await expectActiveOption(page, menu.getByRole('option', {name: '/mcp__probe__connect'}))
      await page.keyboard.press('ArrowUp')
      await expectActiveOption(page, menu.getByRole('option', {name: '/config'}))

      await page.keyboard.press('Enter')
      await expect(menu).toBeHidden({timeout: 10_000})
      await expect(input).toHaveText('/config ')
    })
  })
})

test.describe('dead engine boot', () => {
  const ASSISTANT_TEXT = 'Recovered from a dead boot'
  const MOUNT_TIMEOUT_MS = 30_000

  let kit: EmbedKit

  test.beforeAll(async () => {
    kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  })

  test.afterAll(async () => {
    await kit.cleanup()
  })

  test.describe('the router error screen surfaces a dead engine at boot and Retry recovers it', () => {
    test('FAB click against a connection-refused base shows our error screen, then Retry recovers once the engine is reachable', async ({
      page,
    }) => {
      test.setTimeout(90_000)
      const dead = await reserveDeadPort()
      const host = await serveHost(() =>
        hostPage({apiBase: `${dead.base}${new URL(kit.base).pathname}`, widget: '{"quickTerminal":false}'}),
      )
      let proxy: ProxyCore | null = null
      try {
        await page.goto(host.base, {waitUntil: 'domcontentloaded'})
        await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
        await page.getByRole('button', {name: 'Open conciv chat'}).click()

        const errorScreen = page.getByRole('alert').filter({hasText: /couldn.t reach the engine/})
        await expect(errorScreen).toBeVisible({timeout: MOUNT_TIMEOUT_MS})

        proxy = await proxyTo(kit.base, {port: dead.port})

        await errorScreen.getByRole('button', {name: 'Retry'}).click()

        const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
        await expect(composer).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
        await composer.fill('hi there')
        await page.getByRole('button', {name: 'Send message'}).click()
        await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      } finally {
        await host.close()
        if (proxy) await proxy.close()
      }
    })
  })
})

test.describe('draft send remount', () => {
  const ASSISTANT_TEXT = 'Reply to the message sent before the reload'
  const USER_TEXT = 'a message sent right before the reload'

  const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

  test.describe('a sent message never comes back as a draft', () => {
    test('leaves the composer empty when the panel reloads after the send', async ({page}) => {
      test.setTimeout(240_000)
      const sessionId = await openPanelOnNewSession(page, suite)

      const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await input.fill(USER_TEXT)
      await untilPanelDraft(suite.kit(), sessionId, (draft) => draft.text === USER_TEXT)

      await page.getByRole('button', {name: 'Send message'}).click()
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
      await page.reload({waitUntil: 'domcontentloaded'})

      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText('', {timeout: 30_000})
      await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    })
  })
})

test.describe('element capture', () => {
  const PASSWORD = 'hunter2-must-never-leave-the-page'

  const HOST_BODY = `
  <style>.panel .cta {color: rgb(1, 2, 3);}</style>
  <section id="panel" class="panel theme-light">
    <button id="cta" class="cta">Send it</button>
    <p id="prose">original prose</p>
    <input id="secret" type="password" autocomplete="current-password" value="${PASSWORD}">
  </section>
`

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}
  let sessionId: string

  test.beforeAll(async () => {
    kit = await bootEmbedKit()
    sessionId = await kit.session()
    host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}))
  })

  test.afterAll(async () => {
    await host.close()
    await kit.cleanup()
  })

  const openHostPage = (page: Page): Promise<Page> => openPagePlaneHost(page, host.base)

  function rowIdentities(stored: SessionCaptures): string[] {
    return stored.captures.map((row) => `${row.toolCallId}:${row.kind}:${JSON.stringify(row.capture)}`).toSorted()
  }

  async function sendAndSettle(page: Page, message: string): Promise<void> {
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(message)
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect(page.getByRole('button', {name: 'Stop generating'})).toBeHidden({timeout: 30_000})
  }

  test.describe('a page tool run through the widget stores a frozen picture of the element it touched', () => {
    test('never lets a password value reach the stored capture or the tool result', async ({page}) => {
      test.setTimeout(90_000)
      await openHostPage(page)
      const result = await kit.callTool('page_fill', {selector: '#secret', value: 'typed by the agent'}, sessionId)
      const stored: SessionCaptures = await kit.rpc.captures.list({sessionId})
      const secretCaptures = stored.captures.filter((row) => row.capture.descriptor.selectorPath.includes('secret'))
      expect(secretCaptures.map((row) => row.kind).toSorted()).toEqual(['after'])
      for (const row of secretCaptures) expect(JSON.stringify(row.capture)).not.toContain(PASSWORD)
      expect(JSON.stringify(result)).not.toContain(PASSWORD)
      expect(JSON.stringify(stored)).not.toContain(PASSWORD)
    })

    test('hands the harness a result with no capture in it', async ({page}) => {
      test.setTimeout(90_000)
      await openHostPage(page)
      const result = await kit.callTool('page_click', {selector: '#cta'}, sessionId)
      expect(JSON.stringify(result)).not.toContain('cssBundleId')
      expect(JSON.stringify(result)).not.toContain('selectorPath')
      expect(JSON.stringify(result)).not.toContain('data-rr-target')
    })

    test('takes no capture for a read verb', async ({page}) => {
      test.setTimeout(90_000)
      await openHostPage(page)
      const before: SessionCaptures = await kit.rpc.captures.list({sessionId})
      await kit.callTool('page_text', {selector: '#cta'}, sessionId)
      const after: SessionCaptures = await kit.rpc.captures.list({sessionId})
      expect(rowIdentities(after)).toEqual(rowIdentities(before))
    })

    test('renders a page verb run through real code mode as one aggregated session card fed by the capture pipeline', async ({
      page,
    }) => {
      test.setTimeout(180_000)
      await openHostPage(page)
      await openPanel(page)
      kit.harness.script.scriptToolCall('execute_typescript', {
        typescriptCode: "await external_page_settext({selector: '#prose', text: 'rendered through the pipeline'})",
      })
      await sendAndSettle(page, 'rewrite the prose through code mode')
      const sessionCard = page.getByRole('button', {name: /Edited the page/})
      await expect(sessionCard).toBeVisible({timeout: 30_000})
      await expect(page.getByRole('button', {name: /Set the text/})).toHaveCount(0)
      await expect(sessionCard).toHaveAttribute('aria-expanded', 'true')
      const dialog = page.getByRole('dialog', {name: 'conciv chat agent'})
      const stepTarget = dialog.getByText('rendered through the pipeline', {exact: true})
      await expect(stepTarget).toBeVisible({timeout: 30_000})
      await dialog.getByRole('button', {name: 'Script'}).click()
      await expect(dialog.getByText(/external_page_settext/).first()).toBeVisible({timeout: 30_000})
    })
  })
})

test.describe('forced drop', () => {
  const ASSISTANT_TEXT = 'Reply across the drop'
  const FIRST_TEXT = 'first turn before the drop'
  const SECOND_TEXT = 'second turn after the drop'
  const MOUNT_TIMEOUT_MS = 20_000

  const suite = setupProxiedEmbedSuite({text: ASSISTANT_TEXT})

  async function sendTurn(page: Page, text: string): Promise<void> {
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(text)
    await page.getByRole('button', {name: 'Send message'}).click()
  }

  test.describe('chat survives a forced websocket drop', () => {
    test('reopens the chat socket and completes the next turn after the core drops every connection', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(String(error)))
      const wire = watchChatWire(page)
      await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: 'Open conciv chat'}).click()
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({
        timeout: MOUNT_TIMEOUT_MS,
      })

      const first = wire.nextTurn()
      await sendTurn(page, FIRST_TEXT)
      expect((await first).transport).toBe('websocket')
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: MOUNT_TIMEOUT_MS})

      const mark = wire.socketMark()
      const second = wire.nextTurn()
      suite.core().dropConnections()

      await sendTurn(page, SECOND_TEXT)
      expect((await second).transport).toBe('websocket')
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: MOUNT_TIMEOUT_MS})

      expect(wire.socketsOpenedSince(mark)).toBeGreaterThan(0)
      expect(pageErrors).toEqual([])
    })
  })
})

test.describe('host hotkey isolation', () => {
  const HOST_SEARCH_HOTKEY = `
  <button type="button">Host focus target</button>
  <div id="host-search" role="status" aria-label="host search">host search idle</div>
  <script>
    function isEditingContent(event) {
      var element = event.target
      var tagName = element.tagName
      return element.isContentEditable || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA'
    }
    window.addEventListener('keydown', function (event) {
      if (event.key !== '/') return
      if (isEditingContent(event)) return
      event.preventDefault()
      document.getElementById('host-search').textContent = 'host search open'
    })
  </script>
`

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit()
    host = await serveHost(() =>
      hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_SEARCH_HOTKEY}),
    )
  })

  test.afterEach(async () => {
    await host.close()
    await kit.cleanup()
  })

  const suite: WidgetSuite = {kit: () => kit, host: () => host}

  const composer = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const hostSearch = (page: Page) => page.getByRole('status', {name: 'host search'})

  test.describe('host-page keyboard hotkeys and the widget composer', () => {
    test('a slash typed into the composer never reaches the host search hotkey', async ({page}) => {
      test.setTimeout(120_000)
      await openPanelOnNewSession(page, suite)
      const input = composer(page)
      await input.click()
      await expect(input).toHaveText('')

      await input.pressSequentially('run tests in lib/utils')
      await expect(input).toHaveText(/utils/, {timeout: 30_000})

      await expect(hostSearch(page)).toHaveText('host search idle')
      await expect(input).toHaveText('run tests in lib/utils')
    })

    test('a slash pressed with focus on the host page still fires the host search hotkey', async ({page}) => {
      test.setTimeout(120_000)
      await openPanelOnNewSession(page, suite)

      await page.getByRole('button', {name: 'Host focus target'}).click()
      await page.keyboard.press('/')

      await expect(hostSearch(page)).toHaveText('host search open', {timeout: 30_000})
    })
  })
})

test.describe('idle fetch heartbeat', () => {
  const ASSISTANT_TEXT = 'Idle heartbeat reply'
  const UNREACHABLE_TIMEOUT_MS = 45_000
  const RECOVERY_TIMEOUT_MS = 20_000

  const suite = setupProxiedEmbedSuite({text: ASSISTANT_TEXT})

  test.describe('an idle widget notices the engine going unreachable through the rpc heartbeat', () => {
    test('the open panel heartbeat surfaces the unreachable notice with no user interaction, and clears it on recovery', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const listed = await awaitCompletedCall(suite.kit(), [SESSIONS_LIST_CALL])
      const hold = await holdRpcCalls(page)
      await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
      await openChatPanel(page)
      await listed.completed
      listed.stop()

      hold.hold()
      const probe = await abortCalls(suite.kit(), [ENGINE_PROBE_CALL])

      const notice = page.getByText('conciv lost connection to the engine.')
      await expect(notice).toBeVisible({timeout: UNREACHABLE_TIMEOUT_MS})

      probe.repair()
      hold.release()

      await expect(notice).not.toBeVisible({timeout: RECOVERY_TIMEOUT_MS})
    })
  })
})

test.describe('mid session outage', () => {
  const ASSISTANT_TEXT = 'Recovered mid-session'
  const MOUNT_TIMEOUT_MS = 30_000

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    kit = await bootEmbedKit({text: ASSISTANT_TEXT})
    host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
  })

  test.afterAll(async () => {
    await host.close()
    await kit.cleanup()
  })

  test.describe('a mid-session outage raises the standing notice and disables sending, release auto-clears both', () => {
    test('holding all rpc traffic surfaces the notice and a disabled send control, releasing it clears both', async ({
      page,
    }) => {
      test.setTimeout(90_000)
      const hold = await holdRpcCalls(page)
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await openChatPanel(page)

      const composer = chatBox(page)
      await composer.fill('a message queued during the outage')

      hold.hold()
      const probe = await abortCalls(kit, [ENGINE_PROBE_CALL])

      const notice = page.getByText('conciv lost connection to the engine.')
      await expect(notice).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      const disabledSend = page.getByRole('button', {name: 'conciv lost connection to the engine'})
      await expect(disabledSend).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      await expect(disabledSend).toBeDisabled()

      probe.repair()
      hold.release()

      await expect(notice).not.toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      await expect(page.getByRole('button', {name: 'Send message'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
    })
  })
})

test.describe('model selector', () => {
  const HARNESS_MODELS = [
    {id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5'},
    {id: 'claude-opus-4-1', name: 'Claude Opus 4.1'},
  ]

  const suite = setupWidgetSuite({text: 'Hello from conciv', models: HARNESS_MODELS})

  test.describe('model selector error path', () => {
    test.use({viewport: {width: 900, height: 760}})

    test('offers a retry when meta.models fails and recovers on retry', async ({page}) => {
      test.setTimeout(180_000)
      const models = await failCalls(suite.kit(), [MODELS_CALL])
      await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
      await openPanel(page)

      const moreActions = page.getByRole('button', {name: 'More composer actions'})
      await moreActions.click()
      const retry = page.getByRole('menuitem', {name: /Retry loading models/})
      await expect(retry).toBeVisible({timeout: 30_000})
      await expect(page.getByText('Couldn’t load models').first()).toBeVisible({timeout: 30_000})

      models.repair()
      await retry.click()
      await moreActions.click()
      await expect(page.getByRole('menuitem', {name: /^Model: Claude Sonnet 4\.5/})).toBeVisible({timeout: 30_000})
      await page.keyboard.press('Escape')
    })
  })
})

test.describe('mount ready', () => {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    kit = await bootEmbedKit({text: 'ready contract'})
    host = await serveHost(() => handleHostPage())
  })

  test.afterAll(async () => {
    await host.close()
    await kit.cleanup()
  })

  async function openPage(page: Page): Promise<Page> {
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    return page
  }

  test.describe('mount() readiness contract', () => {
    test('an open dispatched right after mount() resolves opens the panel, never dropped', async ({page}) => {
      await openPage(page)
      await page.evaluate(async (base) => {
        const el = document.createElement('div')
        document.body.appendChild(el)
        const handle = window.ConcivHandle.makeHandle(base)
        await handle.mount(el)
        window.dispatchEvent(
          new CustomEvent('conciv-dispatch-event', {
            detail: {type: 'panel:open', payload: undefined, pluginId: 'panel'},
          }),
        )
      }, kit.base)
      await expect(chatBox(page)).toBeVisible({timeout: 10_000})
    })
  })
})

test.describe('native widget', () => {
  type NativeMethod = keyof NonNullable<Window['__concivNative']>

  const nativeDistDir = fileURLToPath(new URL('../../dist/', import.meta.url))

  const IMAGE_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

  const NEUTRAL_GRAB = {
    text: 'Payroll Deposit',
    preview: {kind: 'image', dataUrl: IMAGE_DATA_URL, width: 361, height: 72},
    rect: {x: 16, y: 232, width: 361, height: 72},
    source: {componentName: 'PaymentCardCell', filePath: '', lineNumber: null},
    subtree: {
      class: 'PaymentCardCell',
      a11yId: 'PaymentsScreen/payrollRow',
      text: 'Payroll Deposit',
      rect: {x: 16, y: 232, width: 361, height: 72},
      children: [
        {
          class: 'UILabel',
          a11yId: null,
          text: 'Payroll Deposit',
          rect: {x: 28, y: 240, width: 180, height: 20},
          children: [],
        },
      ],
    },
  }

  function grabPayloadOf(draft: DraftRow): GrabPayload | null {
    const attachment = draft.attachments.find((candidate) => candidate.contentType === GRAB_MIME)
    if (!attachment) return null
    return parseGrabPayload(Buffer.from(attachment.data, 'base64').toString('utf8'))
  }

  let kit: CoreKit
  let sessionId: string

  test.beforeAll(async () => {
    kit = await bootCoreKit({id: 'fake-native', text: 'Hello from conciv', nativePageDir: nativeDistDir})
    sessionId = (await kit.hub.call('conciv:sessions:create', {})).sessionId
  })

  test.afterAll(async () => {
    await kit.cleanup()
  })

  type Native = {
    page: Page
    bridge: NativeBridge
  }

  async function openNative(page: Page): Promise<Native> {
    const bridge = await captureNativePosts(page)
    await installNativeStub(page)
    await page.goto(`${kit.base}/native`, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() => typeof window.__concivNative === 'object')
    return {page, bridge}
  }

  const countType = (messages: PageToNativeMessage[], type: PageToNativeMessage['type']): number =>
    messages.filter((message) => message.type === type).length

  const findByType = <Type extends PageToNativeMessage['type']>(
    messages: PageToNativeMessage[],
    type: Type,
  ): Extract<PageToNativeMessage, {type: Type}> | undefined =>
    messages.find((message): message is Extract<PageToNativeMessage, {type: Type}> => message.type === type)

  function callNative(page: Page, method: NativeMethod, arg: Record<string, unknown>): Promise<void> {
    return page.evaluate((call) => window.__concivNative?.[call.method]?.(call.arg), {method, arg})
  }

  const composerBox = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const panel = (page: Page) => page.getByRole('dialog', {name: 'conciv chat agent'})
  const grabPreview = (page: Page) => panel(page).locator('img')

  async function pickElement(page: Page): Promise<void> {
    const inline = page.getByRole('button', {name: 'Select an element from the page'})
    if (await inline.isVisible()) {
      await inline.click()
      return
    }
    await page.getByRole('button', {name: 'More composer actions'}).click()
    await page.getByRole('menuitem', {name: 'Select an element from the page'}).click()
  }

  test.describe('native widget bridge', () => {
    test('opens the panel on native open and is idempotent, and closes on native close', async ({
      page: fixturePage,
    }) => {
      const listed = await awaitCompletedCall(kit, [SESSIONS_LIST_CALL])
      const {page} = await openNative(fixturePage)
      await listed.completed
      listed.stop()
      await callNative(page, 'open', {v: 1, seq: 1})
      await callNative(page, 'open', {v: 1, seq: 2})
      await expect(composerBox(page)).toHaveCount(1, {timeout: 30_000})
      await expect(composerBox(page)).toBeVisible()
      await callNative(page, 'close', {v: 1, seq: 3})
      await expect(composerBox(page)).toBeHidden({timeout: 30_000})
    })

    test('drives the native grab provider: pick posts a requestId and a matching image grabResult stages the preview', async ({
      page: fixturePage,
    }) => {
      test.setTimeout(120_000)
      const listed = await awaitCompletedCall(kit, [SESSIONS_LIST_CALL])
      const {page, bridge} = await openNative(fixturePage)
      await listed.completed
      listed.stop()
      const picked = Promise.withResolvers<PageToNativeMessage>()
      bridge.notify = (message) => {
        if (message.type === 'grab.pick') picked.resolve(message)
      }
      await callNative(page, 'open', {v: 1, seq: 1})
      await expect(composerBox(page)).toBeVisible({timeout: 30_000})

      await callNative(page, 'grabCapability', {v: 1, seq: 2, grabbable: true})
      await pickElement(page)
      await picked.promise
      const pick = findByType(bridge.posted, 'grab.pick')
      expect(pick?.requestId).toBeTruthy()
      expect(countType(bridge.posted, 'grab.pick')).toBe(1)

      await callNative(page, 'grabResult', {v: 1, seq: 3, requestId: pick?.requestId, grab: NEUTRAL_GRAB})
      await expect(panel(page).getByText('PaymentCardCell')).toBeVisible({timeout: 30_000})
      await expect(grabPreview(page)).toHaveAttribute('src', IMAGE_DATA_URL)
      await untilPanelDraft(kit, sessionId, (draft) => {
        const payload = grabPayloadOf(draft)
        return payload !== null && payload.text.includes('[view]') && payload.text.includes('PaymentCardCell')
      })
    })

    test('surfaces a visible error when native reports an incompatible bridge version', async ({page: fixturePage}) => {
      const {page} = await openNative(fixturePage)
      await callNative(page, 'bridgeIncompatible', {v: 1, seq: 1, nativeMinV: 2, nativeMaxV: 3})
      await expect(page.getByText('Update the conciv widget', {exact: false})).toBeVisible({timeout: 30_000})
    })
  })
})

test.describe('page dispatch parity', () => {
  const HOST_BODY = `
  <div id="probe">page-bus-ok</div>
  <button id="press-btn" onclick="document.getElementById('clicked-flag').textContent='clicked'">Press target</button>
  <output id="clicked-flag"></output>
`

  const ChangesSchema = z.array(z.object({verb: z.string()}).loose())

  async function expectClickDispatched(kit: EmbedKit, page: Page): Promise<void> {
    await expect(kit.rpc.registry.call({name: 'page_click', input: {selector: '#press-btn'}})).resolves.toMatchObject({
      ok: true,
    })
    await expect(kit.rpc.registry.call({name: 'page_text', input: {selector: '#clicked-flag'}})).resolves.toMatchObject(
      {text: 'clicked'},
    )
    const changes = ChangesSchema.parse(await kit.rpc.page.changes(undefined))
    expect(changes.map((entry) => entry.verb)).toContain('page_click')
    await expect(page.locator('[data-conciv-cursor]')).toHaveCount(1, {timeout: 10_000})
  }

  test.describe('bootNormal: the widget embed serves page tools through the dispatcher', () => {
    let kit: EmbedKit
    let host: {base: string; close: () => Promise<void>}
    let page: Page

    test.beforeAll(async ({browser}) => {
      kit = await bootEmbedKit()
      host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}))
      page = await browser.newPage()
      await openPagePlaneHost(page, host.base)
    })

    test.afterAll(async () => {
      await page.close()
      await host.close()
      await kit.cleanup()
    })

    test('act: page_click acts on the page, journals, and fires the browser mirror', async () => {
      await expectClickDispatched(kit, page)
    })
  })

  test.describe('bootConnect: the connect handle serves page tools through the dispatcher', () => {
    let kit: EmbedKit
    let host: {base: string; close: () => Promise<void>}
    let page: Page

    test.beforeAll(async ({browser}) => {
      kit = await bootEmbedKit()
      host = await serveHost(() => handleHostPage(HOST_BODY))
      page = await browser.newPage()
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await page.evaluate(() => {
        const el = document.createElement('div')
        document.body.appendChild(el)
        window.concivTestHandle = window.ConcivHandle.makeConnectHandle()
        void window.concivTestHandle.mount(el)
      })
      await completeConnectHandshake(page, kit.base, await kit.session())
    })

    test.afterAll(async () => {
      await page.close()
      await host.close()
      await kit.cleanup()
    })

    test('act: page_click acts on the page, journals, and fires the browser mirror', async () => {
      await expectClickDispatched(kit, page)
    })

    test('page_effect enable shows the highlight inspector the widget registers, disable reverts, toggle flips', async () => {
      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'enable', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: true})
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(1, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'disable', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: false})
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(0, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'toggle', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: true})
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(1, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'toggle', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: false})
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(0, {timeout: 10_000})
    })
  })
})

test.describe('panel focus', () => {
  const suite = setupWidgetSuite()

  const COMPOSER_NAME = 'Message the conciv agent'

  function composer(page: Page) {
    return page.getByRole('textbox', {name: COMPOSER_NAME})
  }

  function sessionOptionsButton(page: Page) {
    return page.getByRole('button', {name: 'Session options'})
  }

  async function ensurePanelClosed(page: Page): Promise<void> {
    const minimize = page.getByRole('button', {name: 'Minimize conciv chat'})
    const opener = page.getByRole('button', {name: 'Open conciv chat'})
    await expect(minimize.or(opener)).toBeVisible({timeout: 30_000})
    if (await minimize.isVisible()) await minimize.click()
    await expect(opener).toBeVisible({timeout: 30_000})
  }

  type HostedPanel = {host: Awaited<ReturnType<typeof serveHost>>; page: Page; hostButton: Locator}

  const dedicatedHosts: Array<{close: () => Promise<void>}> = []

  test.afterEach(async () => {
    for (const dedicatedHost of dedicatedHosts.splice(0)) await dedicatedHost.close()
  })

  async function openPanelOverFocusedHostButton(page: Page): Promise<HostedPanel> {
    const host = await serveHost(() =>
      hostPage({
        apiBase: suite.kit().base,
        widget: '{"quickTerminal":false}',
        body: '<button id="host-action">Host action</button>',
      }),
    )
    dedicatedHosts.push(host)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await ensurePanelClosed(page)
    const hostButton = page.getByRole('button', {name: 'Host action'})
    await hostButton.click()
    await expect(hostButton).toBeFocused()
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('conciv-dispatch-event', {
          detail: {type: 'panel:open', payload: undefined, pluginId: 'panel'},
        }),
      ),
    )
    await expect(composer(page)).toBeVisible({timeout: 30_000})
    return {host, page, hostButton}
  }

  test.describe('panel open focuses the composer', () => {
    test('focuses the composer input when the panel opens', async ({page}) => {
      test.setTimeout(90_000)
      await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
      await openPanel(page)
      await expect(composer(page)).toBeFocused({timeout: 10_000})
      await page.keyboard.type('typed without clicking')
      await expect(composer(page)).toHaveText('typed without clicking')
    })

    test('paints the shell while the session list is still loading, then focuses the composer', async ({page}) => {
      test.setTimeout(90_000)
      const host = await serveHost(() =>
        hostPage({apiBase: suite.kit().base, widget: '{"quickTerminal":false,"transport":"fetch"}'}),
      )
      dedicatedHosts.push(host)
      const sessionListGate = await gateCalls(suite.kit(), [SESSIONS_LIST_CALL])
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      try {
        await sessionListGate.arrived
        await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 15_000})
      } finally {
        sessionListGate.release()
      }
      await openPanel(page)
      await expect(sessionOptionsButton(page)).toBeVisible({timeout: 30_000})
      await expect(composer(page)).toBeFocused({timeout: 30_000})
      await page.keyboard.type('typed after the session list resolved')
      await expect(composer(page)).toHaveText('typed after the session list resolved')
    })
  })

  test.describe('panel close restores focus: host element captured at open wins, FAB is the fallback', () => {
    test('closing via the FAB restores the host element that was focused before a programmatic open', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const {hostButton} = await openPanelOverFocusedHostButton(page)
      await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
      await expect(hostButton).toBeFocused({timeout: 10_000})
    })

    test('closing via the FAB falls back to FAB focus when no host element was captured at open time', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
      await ensurePanelClosed(page)
      await page.getByRole('button', {name: 'Open conciv chat'}).click()
      await expect(composer(page)).toBeVisible({timeout: 30_000})
      await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
      await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeFocused({timeout: 10_000})
    })
  })

  test.describe('panel restore-on-load never steals focus from the host page', () => {
    test('reloading with a restored open panel leaves an autofocused host input focused', async ({page}) => {
      test.setTimeout(180_000)
      const host = await serveHost(() =>
        hostPage({
          apiBase: suite.kit().base,
          widget: '{"quickTerminal":false}',
          body: '<input aria-label="Host search" autofocus>',
        }),
      )
      dedicatedHosts.push(host)
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await openPanel(page)
      await until(async () => (await currentHref(suite.kit())).includes('open=true'), {
        hangGuardMs: 30_000,
        intervalMs: 100,
      })
      expect(await currentHref(suite.kit())).toContain('open=true')

      await page.reload({waitUntil: 'domcontentloaded'})
      const hostInput = page.getByRole('textbox', {name: 'Host search'})
      await expect(hostInput).toBeFocused({timeout: 10_000})
      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(hostInput).toBeFocused({timeout: 10_000})
    })
  })
})

test.describe('rebind', () => {
  const ASSISTANT_TEXT = 'Rebound reply'
  const USER_TEXT = 'first message before the drift'
  const SECOND_USER_TEXT = 'second message after the drift'

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit({text: ASSISTANT_TEXT})
    host = await serveHost(() => handleHostPage())
  })

  test.afterEach(async () => {
    await host.close()
    await kit.cleanup()
  })

  async function panelSession(): Promise<string | null> {
    const state = await kit.rpc.navigation.get(undefined)
    const entry = state?.entries.find((row) => row.href.startsWith('/panel/'))
    if (!entry) return null
    return (entry.href.split('/')[2] ?? '').split('?')[0] ?? null
  }

  test.describe('handle.rebind survives same-core port drift', () => {
    let proxyA: ProxyCore
    let proxyB: ProxyCore

    test.beforeEach(async () => {
      proxyA = await proxyTo(kit.base)
      proxyB = await proxyTo(kit.base)
    })

    test.afterEach(async () => {
      await proxyB.close()
    })

    test('re-points rpc and SSE to the new port, keeps the panel open, the session, and delivers the next turn', async ({
      page,
    }) => {
      test.setTimeout(480_000)
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(String(error)))
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})

      await mountHandle(page, proxyA.base)
      await openChatPanel(page)

      const apiBaseProbe = page.getByRole('status', {name: 'host api base probe'})
      await expect(apiBaseProbe).toHaveText(proxyA.base, {timeout: 30_000})

      await until(async () => (await panelSession()) !== null, {hangGuardMs: 30_000, intervalMs: 100})
      const sessionBefore = await panelSession()
      expect(sessionBefore).not.toBeNull()

      await sendChatMessage(page, USER_TEXT)
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

      const beforeB = proxyB.trafficCount()
      await rebindHandle(page, proxyB.base)
      await proxyA.close()

      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(chatBox(page)).toBeVisible({timeout: 30_000})

      await expect(apiBaseProbe).toHaveText(proxyB.base, {timeout: 30_000})
      await until(async () => proxyB.requestedPaths().some((requested) => requested.startsWith('/__conciv/')), {
        hangGuardMs: 30_000,
        intervalMs: 100,
      })

      await expect(chatLog(page).getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

      await sendChatMessage(page, SECOND_USER_TEXT)
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: 30_000})
      await expect(chatLog(page).getByText(SECOND_USER_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(chatLog(page).getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})

      expect(proxyB.trafficCount()).toBeGreaterThan(beforeB)
      expect(await panelSession()).toBe(sessionBefore)
      expect(sessionBefore).not.toBeNull()
      expect(pageErrors).toEqual([])
    })
  })
})

test.describe('recording attachment', () => {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    kit = await bootEmbedKit({text: 'Recording received', extensions: [recorderServer]})
    host = await serveHost(() =>
      hostPage({
        apiBase: kit.base,
        widget: '{"quickTerminal":false}',
        body: '<button>Embed fixture</button>',
      }),
    )
  })

  test.afterAll(async () => {
    await host.close()
    await kit.cleanup()
  })

  const ClickEventSchema = z.object({
    type: z.literal(3),
    data: z.looseObject({source: z.literal(2), type: z.literal(2)}),
  })

  const AppendedEventsSchema = z.object({events: z.array(z.unknown())})

  test.describe('recording attachment end to end in the real widget', () => {
    test('composes the card chip, sends log text to the model, renders the durable transcript card', async ({page}) => {
      test.setTimeout(480_000)
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})

      await openPanel(page)
      const recorderRpc = makeExtRpcClient<RecorderRouter>(kit.base, 'recorder')
      const client: {id?: string} = {}
      const clicksAppendedSince = async (cursor: number): Promise<number> => {
        if (!client.id) throw new Error('no recorder client connected')
        const appended = AppendedEventsSchema.parse(await recorderRpc.events({cursor, clientId: client.id}))
        return appended.events.filter((event) => ClickEventSchema.safeParse(event).success).length
      }

      await page.getByRole('tab', {name: 'Recorder'}).click()
      await until(
        async () => {
          const {clients} = await recorderRpc.clients()
          if (clients.length > 1) throw new Error(`expected one recorder client for this page, saw ${clients.length}`)
          client.id = clients[0]?.id
          return client.id !== undefined
        },
        {hangGuardMs: 30_000, intervalMs: 100},
      )
      if (!client.id) throw new Error('no recorder client connected')
      const captureBaseline = (await recorderRpc.window({clientId: client.id})).cursor

      await page.getByRole('button', {name: 'Embed fixture'}).click()
      await page.getByRole('button', {name: 'Embed fixture'}).click()
      await until(async () => (await clicksAppendedSince(captureBaseline)) >= 2, {
        hangGuardMs: 30_000,
        intervalMs: 100,
      })

      const send = page.getByRole('button', {name: 'Send to agent'})
      await send.waitFor({state: 'visible', timeout: 15_000})
      await send.click()

      await page
        .getByText(/Screen recording · \d+ action/)
        .first()
        .waitFor({state: 'visible', timeout: 15_000})
      expect(await page.getByText('recording.txt').count()).toBe(0)

      const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await input.fill('here is what I did')
      await page.getByRole('button', {name: 'Send message'}).click()
      await expect(page.getByText('Recording received').first()).toBeVisible({timeout: 30_000})

      const sessions = await kit.hub.call('conciv:sessions:list', {})
      const chatSession = sessions[0]?.id
      if (!chatSession) throw new Error('widget session not found')
      const persisted = {messages: ''}
      await until(
        async () => {
          persisted.messages = JSON.stringify((await kit.rpc.chat.hydrate({sessionId: chatSession})).messages)
          return persisted.messages.includes('[click]')
        },
        {hangGuardMs: 30_000, intervalMs: 200},
      )
      expect(persisted.messages).toContain('"modelOnly":true')

      const transcript = page.getByRole('log')
      await transcript
        .getByText(/Screen recording · \d+ action/)
        .first()
        .waitFor({state: 'visible', timeout: 15_000})
      await transcript.getByRole('button', {name: 'Play'}).first().waitFor({state: 'visible', timeout: 15_000})
      expect(await transcript.getByText('[click]').count()).toBe(0)
      expect(await page.getByRole('img').count()).toBe(0)

      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await page
        .getByRole('log')
        .getByText(/Screen recording · \d+ action/)
        .first()
        .waitFor({state: 'visible', timeout: 20_000})
      await page
        .getByRole('log')
        .getByRole('button', {name: 'Play'})
        .first()
        .waitFor({state: 'visible', timeout: 15_000})

      await page.getByRole('log').getByRole('button', {name: 'Play'}).first().click()
      const modal = page.getByRole('dialog', {name: 'Screen recording replay'})
      await modal.waitFor({state: 'visible', timeout: 15_000})
      await modal.getByRole('button', {name: 'Close'}).click()
      await modal.waitFor({state: 'hidden', timeout: 15_000})
      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      const composerAfterModal = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composerAfterModal.fill('still alive after replay')
      await expect(composerAfterModal).toHaveText('still alive after replay')
    })
  })
})

test.describe('reload continuity', () => {
  const ASSISTANT_TEXT = 'Continuity reply'

  const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

  test.describe('reload continuity through the db-backed navigation row', () => {
    test('restores the open panel route, the transcript, and the draft after a reload', async ({page}) => {
      test.setTimeout(240_000)
      const sessionId = await openPanelOnNewSession(page, suite)

      const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await input.fill('remember me')
      await page.getByRole('button', {name: 'Send message'}).click()
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

      await input.fill('an unsent draft survives')
      await input.press('End')
      await untilPanelDraft(suite.kit(), sessionId, (draft) => draft.text === 'an unsent draft survives')

      expect(await suite.kit().rpc.drafts.get({sessionId})).toMatchObject({text: 'an unsent draft survives'})

      await page.reload({waitUntil: 'domcontentloaded'})

      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText(
        'an unsent draft survives',
        {
          timeout: 30_000,
        },
      )
    })
  })
})

test.describe('remount', () => {
  const ASSISTANT_TEXT = 'Remounted reply'
  const USER_TEXT = 'first message before the remount'
  const SECOND_USER_TEXT = 'second message after the remount'

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    host = await serveHost(() => handleHostPage())
  })

  test.afterAll(async () => {
    await host.close()
  })

  test.beforeEach(async () => {
    kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  })

  test.afterEach(async () => {
    await kit.cleanup()
  })

  test.describe('handle unmount and remount keeps delivering turns', () => {
    test('renders the second assistant reply after a full unmount and remount', async ({page}) => {
      test.setTimeout(240_000)
      const pageErrors = await openHostWithHandle(page, host.base, kit.base)
      await openChatPanel(page)

      await sendChatMessage(page, USER_TEXT)
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

      await unmountHandle(page)
      await expect(page.getByRole('button', {name: 'Open conciv chat'})).toHaveCount(0, {timeout: 30_000})

      await remountHandle(page)
      await expect(chatBox(page)).toBeVisible({timeout: 30_000})
      await expect(chatLog(page).getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

      await sendChatMessage(page, SECOND_USER_TEXT)
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: 30_000})
      await expect(chatLog(page).getByText(SECOND_USER_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(chatLog(page).getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})

      expect(pageErrors).toEqual([])
    })
  })
})

test.describe('selection containment', () => {
  const ASSISTANT_REPLY = 'The widget reply stays selectable inside the chat thread for quoting.'

  const HOST_TEXT = 'Host page article text that must never join a chat selection.'

  const HOST_BODY = `
  <style>main p{user-select:text !important}</style>
  <main style="padding:48px 60% 0 24px;font:20px/1.6 sans-serif">
    <p>${HOST_TEXT}</p>
    <p>${HOST_TEXT}</p>
    <p>${HOST_TEXT}</p>
  </main>
`

  type Point = {x: number; y: number}

  type SelectionEnds = {startInWidget: boolean; endInWidget: boolean; text: string}

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit({text: ASSISTANT_REPLY})
    host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}))
  })

  test.afterEach(async () => {
    await host.close()
    await kit.cleanup()
  })

  async function openWithReply(page: Page): Promise<void> {
    await page.setViewportSize({width: 1400, height: 900})
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await sendMessage(page, 'say something selectable', ASSISTANT_REPLY)
  }

  async function textStart(page: Page, text: string): Promise<Point> {
    const box = await page.getByText(text).first().boundingBox()
    expect(box).not.toBeNull()
    return {x: (box?.x ?? 0) + 60, y: (box?.y ?? 0) + (box?.height ?? 0) / 2}
  }

  async function drag(page: Page, from: Point, to: Point): Promise<void> {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, {steps: 12})
    await page.mouse.up()
  }

  function selectionEnds(page: Page): Promise<SelectionEnds> {
    return page.evaluate(() => {
      const root = document.querySelector('[data-conciv-root]')?.shadowRoot
      const selection = document.getSelection()
      const range = root ? selection?.getComposedRanges({shadowRoots: [root]})[0] : undefined
      return {
        startInWidget: range?.startContainer.getRootNode() === root,
        endInWidget: range?.endContainer.getRootNode() === root,
        text: selection?.toString() ?? '',
      }
    })
  }

  test.describe('text selection and the host page', () => {
    const outwardDrags: {name: string; target: (page: Page) => Promise<Point>; selects: RegExp}[] = [
      {
        name: 'up past the top of the panel',
        target: async (page) => ({...(await textStart(page, ASSISTANT_REPLY)), y: 2}),
        selects: /^\s*CONCIV[\s\S]*say something selectable[\s\S]*The widge$/,
      },
      {name: 'sideways over host page text', target: (page) => textStart(page, HOST_TEXT), selects: /^The widge$/},
      {
        name: 'down past the bottom of the panel',
        target: async (page) => ({...(await textStart(page, ASSISTANT_REPLY)), y: 895}),
        selects: /^t reply stays selectable inside the chat thread for quoting\.\s*$/,
      },
    ]

    for (const outward of outwardDrags) {
      test(`on a host page that forces its article text selectable with !important, a selection dragged from the chat reply ${outward.name} stays inside the widget`, async ({
        page,
      }) => {
        test.setTimeout(120_000)
        await openWithReply(page)

        await drag(page, await textStart(page, ASSISTANT_REPLY), await outward.target(page))

        const ends = await selectionEnds(page)
        expect(ends.text).toMatch(outward.selects)
        expect(ends).toMatchObject({startInWidget: true, endInWidget: true})
      })
    }

    test('a selection started on the host page and dragged over the panel still selects host text', async ({page}) => {
      test.setTimeout(120_000)
      await openWithReply(page)

      await drag(page, await textStart(page, HOST_TEXT), await textStart(page, ASSISTANT_REPLY))

      const ends = await selectionEnds(page)
      expect(ends.text).toContain('page article text')
      expect(ends.startInWidget).toBe(false)
    })
  })
})

test.describe('unknown view restore', () => {
  const suite = setupWidgetSuite({text: 'Unknown view reply', extensions: [recorderServer]})

  test.describe('restoring a persisted panel route whose extension view is no longer mounted', () => {
    test('lands on the chat view instead of an empty pane', async ({page}) => {
      test.setTimeout(240_000)
      await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
      await openPanel(page)

      await page.getByRole('tab', {name: 'Recorder'}).click()
      await expect(page.getByRole('tab', {name: 'Recorder'})).toHaveAttribute('aria-selected', 'true')
      await until(async () => (await currentHref(suite.kit())).includes('/recorder'), {
        hangGuardMs: 30_000,
        intervalMs: 100,
      })

      await page.goto(`${suite.host().base}/?extensions=terminal`, {waitUntil: 'domcontentloaded'})

      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(page.getByRole('tab', {name: 'Recorder'})).toHaveCount(0)
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})
      const statusBar = page.getByRole('toolbar', {name: 'Session status'})
      await expect(statusBar.getByRole('tab', {name: 'Chat', exact: true})).toHaveAttribute('aria-selected', 'true')
      await until(async () => !(await currentHref(suite.kit())).includes('/recorder'), {
        hangGuardMs: 30_000,
        intervalMs: 100,
      })
    })
  })
})

test.describe('virtualize threshold cliff', () => {
  const MARKDOWN_HEAVY_REPLY = [
    '## Findings',
    '',
    'Here is a **detailed** breakdown with `inline code` and a fenced block:',
    '',
    '```ts',
    'function reconcileSnapshotToolCalls(snapshot: UIMessage[]): UIMessage[] {',
    '  const prevToolCalls = new Map<string, ToolCallPart>()',
    '  for (const msg of snapshot) for (const part of msg.parts) {',
    '    if (part.type === "tool-call") prevToolCalls.set(part.id, part)',
    '  }',
    '  return snapshot',
    '}',
    '```',
    '',
    '- first bullet point with some explanation',
    '- second bullet point that is a bit longer to force line wrapping in the estimator',
    '- third bullet point',
    '',
    '> a blockquote noting a caveat worth remembering',
  ].join('\n')

  const VIRTUALIZE_THRESHOLD_MIRRORED_FROM_UI_KIT_CHAT = 15
  const BELOW_EXCHANGES = Math.floor((VIRTUALIZE_THRESHOLD_MIRRORED_FROM_UI_KIT_CHAT - 1) / 2)
  const ABOVE_EXCHANGES = Math.ceil(VIRTUALIZE_THRESHOLD_MIRRORED_FROM_UI_KIT_CHAT / 2)

  const suite = setupWidgetSuite({text: MARKDOWN_HEAVY_REPLY})

  async function seedExchanges(sessionId: string, exchanges: number): Promise<void> {
    const kit = suite.kit()
    for (let index = 0; index < exchanges; index += 1) {
      const turn = await kit.chat(`question number ${index} about the reconciliation logic`, sessionId)
      await turn.done({hangGuardMs: 10_000})
    }
  }

  async function measureSwitch(page: import('@playwright/test').Page, exchanges: number): Promise<{rowCount: number}> {
    const {sessionId} = await suite.kit().hub.call('conciv:sessions:create', {})
    const title = `cliff ${exchanges} ${sessionId.slice(-8)}`
    await suite.kit().hub.call('conciv:sessions:rename', {sessionId, title})
    await seedExchanges(sessionId, exchanges)

    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await switchToSessionByTitle(page, title)
    await expect(page.getByText(`question number ${exchanges - 1}`).first()).toBeVisible({timeout: 30_000})

    const rowCount = await page.locator('[data-message-id]').count()
    return {rowCount}
  }

  test.describe('virtualize threshold cliff', () => {
    test('a transcript just below the virtualize threshold mounts every turn; crossing it bounds the DOM again', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      const below = await measureSwitch(page, BELOW_EXCHANGES)

      const at = await measureSwitch(page, ABOVE_EXCHANGES)

      expect(below.rowCount, 'below the threshold every turn is mounted unvirtualized').toBe(BELOW_EXCHANGES * 2)
      expect(
        at.rowCount,
        'at/above the threshold the virtualizer bounds the mounted rows to a window smaller than the transcript',
      ).toBeLessThan(ABOVE_EXCHANGES * 2)
    })
  })
})
