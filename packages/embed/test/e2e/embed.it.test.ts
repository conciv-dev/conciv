import {expect, test, type Browser, type Locator, type Page, type WebSocketRoute} from '@playwright/test'
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
  browserBase,
  openLoggedIn,
  logInFromPanelNotice,
  logInFromPanelNoticeWithCode,
  requestLoginCode,
  serveWidgetHost,
} from '../helpers.js'
import {currentHref} from '@conciv/plugin-testkit/navigation-state'
import {until} from '@conciv/harness-testkit/until'
import {GRAB_MIME, parseGrabPayload, type GrabPayload} from '@conciv/grab/grab-attachment'
import {watchChatWire} from '@conciv/plugin-testkit/chat-wire'
import whiteboardServer from '@conciv/extension-whiteboard/server'
import {SessionCapturesSchema, type SessionCaptures} from '@conciv/protocol/element-capture-types'
import {CHAT_WS_PATH, CONCIV_SESSION_HEADER, SessionId} from '@conciv/protocol/chat-types'
import {holdRpcCalls, failRpcCalls, gateRpcCalls} from '@conciv/plugin-testkit/rpc-fault'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'
import type {PageToNativeMessage} from '@conciv/extension-ios/bridge'
import {Buffer} from 'node:buffer'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {makeRpcClient, type DraftRow} from '@conciv/contract'
import {watchRpcWire} from '@conciv/plugin-testkit/rpc-wire'
import {rpcObserverFor, type RpcObserver} from '@conciv/plugin-testkit/rpc-observer'
import {rpcSocketFor} from '@conciv/plugin-testkit/rpc-socket'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import {z} from 'zod'
import {completeConnectHandshake} from '@conciv/plugin-testkit/connect-handshake'
import {revokeBrowsers} from '@conciv/protocol/engine-trust'
import {concivStateDir} from '@conciv/protocol/state-types'

test.describe('embed boot', () => {
  const ASSISTANT_TEXT = 'Hello from conciv'
  const PHONE_VIEWPORT = {width: 393, height: 800}

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit({text: ASSISTANT_TEXT, terminal: true})
    host = await serveWidgetHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
  })

  test.afterEach(async () => {
    await host.close()
    await kit.cleanup()
  })

  async function openPage(page: Page): Promise<Page> {
    await openLoggedIn(page, kit, host.base)
    return page
  }

  async function reopenPage(page: Page): Promise<Page> {
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    return page
  }

  test.describe('embed boots the conciv app against a real core', () => {
    test('a reload restores the panel open on the same view', async ({page, context}) => {
      test.setTimeout(180_000)
      const first = await openPage(page)
      await openPanel(first)
      await first.getByRole('tab', {name: 'Terminal'}).click()
      await expect(first.getByRole('textbox', {name: 'Terminal input'})).toBeAttached({timeout: 30_000})
      const screen = first.getByRole('tabpanel', {name: 'Terminal'}).getByRole('list')
      await expect(screen.getByText('P>', {exact: true}).last()).toBeAttached({timeout: 30_000})
      await expect(first.getByRole('textbox', {name: 'Terminal input'})).toBeFocused({timeout: 30_000})
      await first.keyboard.type('echo $((6*7))')
      await first.keyboard.press('Enter')
      await expect(screen.getByText('42', {exact: true})).toBeAttached({timeout: 30_000})
      await until(async () => (await currentHref(kit)).includes('/terminal'), {hangGuardMs: 30_000, intervalMs: 100})
      expect(await currentHref(kit)).toMatch(/\/terminal%3Aterminal\?.*open=true/)
      await first.close()
      const second = await reopenPage(await context.newPage())
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
      const second = await reopenPage(await context.newPage())
      await expect(second.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
      expect(await second.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(0)
    })

    test('picking any session in the session menu closes the menu on that session', async ({page}) => {
      test.setTimeout(120_000)
      const other = await kit.rpc.sessions.create()
      await kit.rpc.sessions.rename({sessionId: other.sessionId, title: 'the other session'})
      await kit.rpc.sessions.create()
      await openPage(page)
      await openPanel(page)
      await switchToSessionByTitle(page, 'the other session')
      await until(
        async () => {
          const href = await currentHref(kit)
          return href.includes(other.sessionId) && !href.includes('/options')
        },
        {hangGuardMs: 30_000, intervalMs: 100},
      )
      expect(await currentHref(kit)).not.toContain('/options')
      await switchToSessionByTitle(page, 'the other session')
    })

    test('sends a message and renders the assistant reply from the fake harness', async ({page}) => {
      test.setTimeout(120_000)
      await openPage(page)
      await openPanel(page)
      await sendMessage(page, 'hi there', ASSISTANT_TEXT)
    })

    test('every rpc call from login to a reply rides one websocket and none goes over http', async ({page}) => {
      test.setTimeout(120_000)
      const httpRpc: string[] = []
      const rpcSockets: string[] = []
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.includes('/rpc/')) httpRpc.push(request.url())
      })
      page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname.endsWith(RPC_WS_PATH)) rpcSockets.push(socket.url())
      })
      await openPage(page)
      await openPanel(page)
      await sendMessage(page, 'hi there', ASSISTANT_TEXT)
      expect(httpRpc).toEqual([])
      expect(rpcSockets).toHaveLength(1)
    })
  })

  test.describe('embed at a phone viewport', () => {
    test.use({viewport: PHONE_VIEWPORT})

    test('opens as a full-screen sheet with the launcher hidden and the composer reachable', async ({page}) => {
      test.setTimeout(240_000)
      await openLoggedIn(page, kit, host.base)
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
      const disabledHost = await serveWidgetHost(() => hostPage({apiBase: kit.base, widget: '{"modal": false}'}))
      await openLoggedIn(page, kit, disabledHost.base)
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
    extensions: [whiteboardServer],
    commands: [
      {name: 'compact', description: 'Compact the conversation'},
      {name: 'config', description: 'Open configuration'},
    ],
  })

  const composer = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const panel = (page: Page) => page.getByRole('dialog', {name: 'conciv chat agent'})

  const waitForDraftWrite = (page: Page, sessionId: string, fragment: string) =>
    untilPanelDraft(page, suite.kit(), sessionId, (draft) => draft.text.includes(fragment))

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
      await input.pressSequentially('@canvas_read')
      await pickSuggestion(page, 'Tools', '@canvas_read')

      await page.keyboard.press('Shift+Enter')
      await input.pressSequentially('second line')

      const expected = 'please run /config then @canvas_read \nsecond line'
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

    test('Escape closes the typeahead first, then cancels the run', async ({page}) => {
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
        await expect(stop).toBeHidden({timeout: 10_000})
        await expect(panel(page)).toBeVisible()
      } finally {
        suite.kit().harness.script.release()
      }
    })

    test('a reload restores the caret where the draft left it, not at the end', async ({page}) => {
      test.setTimeout(90_000)
      const sessionId = await openComposer(page)
      const input = composer(page)

      await input.pressSequentially('hello world')
      await waitForDraftWrite(page, sessionId, 'hello world')
      await expect(input).toBeFocused()
      for (let step = 0; step < 6; step += 1) await page.keyboard.press('ArrowLeft')
      await input.pressSequentially('X')
      await expect(input).toHaveText('helloX world')
      await waitForDraftWrite(page, sessionId, 'helloX world')

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
    await openLoggedIn(page, suite.kit(), suite.host().base)
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
      const host = await serveWidgetHost(() =>
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
        await logInFromPanelNotice(page, kit, 'Log in to use conciv on this page.')

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

test.describe('widget lazy chunks', () => {
  const REPLY = [
    'Here is the pipeline.',
    '',
    '```ts',
    'const total = 1',
    '```',
    '',
    '```mermaid',
    'flowchart LR',
    '  A[Save file] --> B["$$x^2$$"]',
    '  B --> C[Watcher fires]',
    '```',
  ].join('\n')

  const suite = setupWidgetSuite({text: REPLY})

  function widgetChunks(page: Page): string[] {
    const fetched: string[] = []
    page.on('request', (request) => {
      const {pathname} = new URL(request.url())
      if (pathname.startsWith('/widget/')) fetched.push(pathname.slice('/widget/'.length))
    })
    return fetched
  }

  const isMermaid = (chunk: string) => chunk.startsWith('mermaid')
  const isKatex = (chunk: string) => chunk.startsWith('katex')

  test.describe('mermaid and katex load only when a message needs them', () => {
    test('mounts without them, then highlights code and draws a diagram with math once a reply carries them', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      const fetched = widgetChunks(page)
      await openPanelOnNewSession(page, suite)

      expect(fetched.length).toBeGreaterThan(0)
      expect(fetched.filter(isMermaid)).toEqual([])
      expect(fetched.filter(isKatex)).toEqual([])

      await sendChatMessage(page, 'show me the pipeline')

      const log = chatLog(page)
      await expect(log.getByText('const', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(log.getByText('Watcher fires', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(log.getByText('A[Save file] --> B', {exact: false})).toHaveCount(0)
      await expect(log.getByRole('math')).toBeVisible({timeout: 30_000})
      expect(fetched.filter(isMermaid).length).toBeGreaterThan(0)
      expect(fetched.filter(isKatex).length).toBeGreaterThan(0)
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
      await untilPanelDraft(page, suite.kit(), sessionId, (draft) => draft.text === USER_TEXT)

      await page.getByRole('button', {name: 'Send message'}).click()
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
      await page.reload({waitUntil: 'domcontentloaded'})

      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText('', {timeout: 30_000})
      await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
      expect((await suite.kit().rpc.drafts.get({sessionId}))?.text ?? '').toBe('')
    })

    test('a follow-up typed after a queued send is the draft once the queued run starts, also after a reload', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      const RUNNING_TEXT = 'a run that keeps going'
      const QUEUED_TEXT = 'sent while the run goes'
      const FOLLOW_UP_TEXT = 'typed after the queued send'
      const kit = suite.kit()
      const sessionId = await openPanelOnNewSession(page, suite)
      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      const composer = chatBox(page)
      const stop = panel.getByRole('button', {name: 'Stop generating'})
      const queued = panel.getByRole('listitem').filter({hasText: QUEUED_TEXT})
      kit.harness.script.hold()
      try {
        await composer.click()
        await composer.pressSequentially(RUNNING_TEXT)
        await page.keyboard.press('Enter')
        await expect(stop).toBeVisible()
        await expect(chatLog(page).getByText(ASSISTANT_TEXT)).toHaveCount(1)
        await composer.click()
        await composer.pressSequentially(QUEUED_TEXT)
        await page.keyboard.press('Enter')
        await expect(queued).toBeVisible()
        await expect(composer).toHaveText('')

        await composer.click()
        await composer.pressSequentially(FOLLOW_UP_TEXT)
        await untilPanelDraft(page, kit, sessionId, (draft) => draft.text === FOLLOW_UP_TEXT)

        kit.harness.script.release()
        await expect(queued).toBeHidden()
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(1)
        await expect(chatLog(page).getByText(ASSISTANT_TEXT)).toHaveCount(2)
        await expect(stop).toBeHidden()
        expect(await kit.rpc.drafts.get({sessionId})).toMatchObject({text: FOLLOW_UP_TEXT})

        await page.reload({waitUntil: 'domcontentloaded'})
        await expect(panel).toBeVisible()
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(1)
        await expect(composer).toHaveText(FOLLOW_UP_TEXT)
      } finally {
        kit.harness.script.release()
      }
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

  test.beforeAll(async () => {
    kit = await bootEmbedKit()
    host = await serveWidgetHost(() =>
      hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}),
    )
  })

  test.afterAll(async () => {
    await host.close()
    await kit.cleanup()
  })

  const openHostPage = (page: Page): Promise<Page> => openPagePlaneHost(page, kit, host.base)

  function rowIdentities(stored: SessionCaptures): string[] {
    return stored.captures.map((row) => `${row.toolCallId}:${row.kind}:${JSON.stringify(row.capture)}`).toSorted()
  }

  async function storedCaptures(capturesSessionId: string): Promise<SessionCaptures> {
    return SessionCapturesSchema.parse(
      await kit.rpc.plugin.call({
        rpcId: 'experimental.page',
        method: 'captures.list',
        input: {sessionId: capturesSessionId},
      }),
    )
  }

  async function openSessionPanel(page: Page, label: string): Promise<string> {
    const fresh = await kit.rpc.sessions.create()
    const title = `${label} ${fresh.sessionId.slice(-12)}`
    await kit.rpc.sessions.rename({sessionId: fresh.sessionId, title})
    await openHostPage(page)
    await openPanel(page)
    await switchToSessionByTitle(page, title)
    return fresh.sessionId
  }

  async function runInChat(page: Page, chatSessionId: string, typescriptCode: string): Promise<string> {
    const toolCallId = kit.harness.script.scriptToolCall('execute_typescript', {typescriptCode})
    await sendAndSettle(page, 'run the page tool')
    const {messages} = await kit.rpc.chat.hydrate({sessionId: chatSessionId})
    return messages
      .flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === 'tool-result' && part.toolCallId === toolCallId ? [part.content] : [],
        ),
      )
      .join('\n')
  }

  async function sendAndSettle(page: Page, message: string): Promise<void> {
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(message)
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect(page.getByRole('button', {name: 'Stop generating'})).toBeHidden({timeout: 30_000})
  }

  test.describe('a page tool run through the widget stores a frozen picture of the element it touched', () => {
    test('never lets a password value reach the stored capture or the tool result', async ({page}) => {
      test.setTimeout(90_000)
      const chatSessionId = await openSessionPanel(page, 'password fill')
      const result = await runInChat(
        page,
        chatSessionId,
        "return await external_page_fill({selector: '#secret', value: 'typed by the agent'})",
      )
      const stored = await storedCaptures(chatSessionId)
      const secretCaptures = stored.captures.filter((row) => row.capture.descriptor.selectorPath.includes('secret'))
      expect(secretCaptures.map((row) => row.kind).toSorted()).toEqual(['after'])
      for (const row of secretCaptures) expect(JSON.stringify(row.capture)).not.toContain(PASSWORD)
      expect(JSON.stringify(result)).not.toContain(PASSWORD)
      expect(JSON.stringify(stored)).not.toContain(PASSWORD)
    })

    test('hands the harness a result with no capture in it, over the rpc and chat sockets only', async ({page}) => {
      test.setTimeout(90_000)
      const socketPaths = new Set<string>()
      page.on('websocket', (socket) => socketPaths.add(new URL(socket.url()).pathname))
      const chatSessionId = await openSessionPanel(page, 'harness result')
      const result = await runInChat(page, chatSessionId, "return await external_page_click({selector: '#cta'})")
      expect(result).toContain('"success":true')
      expect([...socketPaths].toSorted()).toEqual([CHAT_WS_PATH, RPC_WS_PATH].toSorted())
      expect(JSON.stringify(result)).not.toContain('cssBundleId')
      expect(JSON.stringify(result)).not.toContain('selectorPath')
      expect(JSON.stringify(result)).not.toContain('data-rr-target')
    })

    test('takes no capture for a read verb', async ({page}) => {
      test.setTimeout(90_000)
      const chatSessionId = await openSessionPanel(page, 'read verb')
      const before = await storedCaptures(chatSessionId)
      const result = await runInChat(page, chatSessionId, "return await external_page_text({selector: '#cta'})")
      expect(result).toContain('"success":true')
      const after = await storedCaptures(chatSessionId)
      expect(rowIdentities(after)).toEqual(rowIdentities(before))
    })

    test('renders a page verb run through real code mode as one aggregated session card fed by the capture pipeline', async ({
      page,
    }) => {
      test.setTimeout(180_000)
      const fresh = await kit.rpc.sessions.create()
      const title = `code mode turn ${fresh.sessionId.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: fresh.sessionId, title})
      await openHostPage(page)
      await openPanel(page)
      await switchToSessionByTitle(page, title)
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

    test('names the element a click through real code mode touched in its session card step, not its selector', async ({
      page,
    }) => {
      test.setTimeout(180_000)
      const fresh = await kit.rpc.sessions.create()
      const title = `code mode click ${fresh.sessionId.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: fresh.sessionId, title})
      await openHostPage(page)
      await openPanel(page)
      await switchToSessionByTitle(page, title)
      kit.harness.script.scriptToolCall('execute_typescript', {
        typescriptCode: "await external_page_click({selector: '#cta'})",
      })
      await sendAndSettle(page, 'click the button through code mode')
      const dialog = page.getByRole('dialog', {name: 'conciv chat agent'})
      await expect(dialog.getByText('Send it', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(dialog.getByText('#cta', {exact: true})).toHaveCount(0)
    })
  })

  test.describe('the agent mask while a page action runs', () => {
    test('shows once, under the panel: Stop and the composer take clicks, Tab and Escape keep their panel meaning', async ({
      page,
    }) => {
      await openSessionPanel(page, 'agent mask')
      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      const composer = chatBox(page)
      const stop = panel.getByRole('button', {name: 'Stop generating'})
      const mask = page.getByRole('status', {name: 'Agent is using this page'})
      const firstStop = panel.getByRole('separator', {name: 'Resize chat height'})
      const lastStop = panel.getByRole('tab', {name: 'Chat'})
      kit.harness.script.scriptToolCall('execute_typescript', {
        typescriptCode: "await external_page_click({selector: '#cta'})",
      })
      kit.harness.script.hold()
      try {
        await composer.click()
        await composer.pressSequentially('click the button')
        await page.keyboard.press('Enter')
        await expect(mask).toBeVisible()
        await expect(mask).toHaveCount(1)
        await expect(stop).toBeVisible()

        await stop.click({trial: true})
        await composer.click()
        await expect(composer).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(composer).not.toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(composer).toBeFocused()

        await lastStop.click()
        await expect(lastStop).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(firstStop).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(lastStop).toBeFocused()
        await composer.click()
        await expect(composer).toBeFocused()

        await page.keyboard.press('Escape')
        await expect(stop).toBeHidden()
        await expect(mask).toBeHidden()
        await expect(panel).toBeVisible()
      } finally {
        kit.harness.script.release()
      }
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
      await openLoggedIn(page, suite.kit(), suite.host().base)
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

  test.describe('a queued message survives the chat stream giving up', () => {
    const RUNNING_TEXT = 'keep this run going'
    const QUEUED_TEXT = 'queued while the run goes'

    test('the queued text is back in the composer, the answered message is not, and Enter sends the queued text once', async ({
      page,
    }) => {
      test.setTimeout(180_000)
      await openLoggedIn(page, suite.kit(), suite.host().base)
      await page.getByRole('button', {name: 'Open conciv chat'}).click()
      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      const composer = chatBox(page)
      await expect(composer).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      const stop = panel.getByRole('button', {name: 'Stop generating'})
      const queued = panel.getByRole('listitem').filter({hasText: QUEUED_TEXT})
      const gaveUp = /reconnect ceiling/
      const errorRow = panel
        .getByRole('alert')
        .filter({hasText: gaveUp, has: page.getByRole('button', {name: 'Retry'})})
      let reopened: ProxyCore | null = null
      suite.kit().harness.script.hold()
      try {
        await composer.click()
        await composer.pressSequentially(RUNNING_TEXT)
        await page.keyboard.press('Enter')
        await expect(stop).toBeVisible()
        await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1)
        await composer.click()
        await composer.pressSequentially(QUEUED_TEXT)
        await page.keyboard.press('Enter')
        await expect(queued).toBeVisible()

        const port = suite.core().port
        await suite.core().close()
        await expect(page.getByText(gaveUp).first()).toBeVisible()
        reopened = await proxyTo(suite.kit().base, {port})
        suite.kit().harness.script.release()
        await expect(errorRow).toBeVisible()

        await expect(queued).toBeHidden()
        await expect(composer).toHaveText(QUEUED_TEXT)
        await expect(composer).not.toContainText(RUNNING_TEXT)

        await composer.click()
        await page.keyboard.press('Enter')
        await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2)
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(1)
        await expect(chatLog(page).getByText(RUNNING_TEXT)).toHaveCount(1)
        await expect(composer).toHaveText('')

        const UNANSWERED_TEXT = 'sent but never answered'
        const QUEUED_AFTER_TEXT = 'queued behind the unanswered send'
        suite.kit().harness.script.holdStart()
        await composer.click()
        await composer.pressSequentially(UNANSWERED_TEXT)
        await page.keyboard.press('Enter')
        await expect(stop).toBeVisible()
        await expect(chatLog(page).getByText(UNANSWERED_TEXT)).toHaveCount(1)
        await composer.click()
        await composer.pressSequentially(QUEUED_AFTER_TEXT)
        await page.keyboard.press('Enter')
        const queuedAfter = panel.getByRole('listitem').filter({hasText: QUEUED_AFTER_TEXT})
        await expect(queuedAfter).toBeVisible()
        const closing = reopened
        reopened = null
        await closing.close()
        await expect(queuedAfter).toBeHidden()
        await expect(stop).toBeHidden()
        await expect(composer).toHaveText(new RegExp(`^${UNANSWERED_TEXT}\\s*${QUEUED_AFTER_TEXT}$`))
      } finally {
        suite.kit().harness.script.releaseStart()
        suite.kit().harness.script.release()
        if (reopened) await reopened.close()
      }
    })

    test('a queue lost while the pane shows another session is in the composer on the way back, and an answered message is never put back', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      const ANSWERED_TEXT = 'answered before the cut'
      const kit = suite.kit()
      const away = await kit.rpc.sessions.create()
      const awayTitle = `session away ${away.sessionId.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: away.sessionId, title: awayTitle})
      const refusing = {value: false}
      const chatSockets: WebSocketRoute[] = []
      await page.routeWebSocket(
        (url) => url.pathname.endsWith(CHAT_WS_PATH),
        (socket) => {
          if (refusing.value) return socket.close()
          chatSockets.push(socket)
          socket.connectToServer()
        },
      )
      const cutChatStream = async (): Promise<void> => {
        refusing.value = true
        await Promise.all(chatSockets.splice(0).map((socket) => socket.close()))
      }
      const sessionId = SessionId.parse(await openPanelOnNewSession(page, suite))
      const title = `session under test ${sessionId.slice(-12)}`
      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      const composer = chatBox(page)
      const stop = panel.getByRole('button', {name: 'Stop generating'})
      const queued = panel.getByRole('listitem').filter({hasText: QUEUED_TEXT})
      const gaveUp = /reconnect ceiling/
      kit.harness.script.hold()
      try {
        await composer.click()
        await composer.pressSequentially(RUNNING_TEXT)
        await page.keyboard.press('Enter')
        await expect(stop).toBeVisible()
        await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1)
        await composer.click()
        await composer.pressSequentially(QUEUED_TEXT)
        await page.keyboard.press('Enter')
        await expect(queued).toBeVisible()

        await switchToSessionByTitle(page, awayTitle)
        await expect(chatLog(page).getByText(RUNNING_TEXT)).toHaveCount(0)
        await cutChatStream()
        await until(async () => (await kit.rpc.drafts.get({sessionId}))?.text.includes(QUEUED_TEXT) === true, {
          hangGuardMs: 60_000,
          intervalMs: 100,
        })
        refusing.value = false
        kit.harness.script.release()

        await switchToSessionByTitle(page, title)
        await expect(composer).toHaveText(QUEUED_TEXT)
        await expect(queued).toBeHidden()
        await composer.click()
        await page.keyboard.press('Enter')
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(1)
        await expect(chatLog(page).getByText(RUNNING_TEXT)).toHaveCount(1)
        await expect(stop).toBeHidden()
        await expect(composer).toHaveText('')

        kit.harness.script.hold()
        await composer.click()
        await composer.pressSequentially(ANSWERED_TEXT)
        await page.keyboard.press('Enter')
        await expect(stop).toBeVisible()
        await expect(chatLog(page).getByText(ANSWERED_TEXT)).toHaveCount(1)
        await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(3)
        await cutChatStream()
        const gaveUpNotice = page
          .getByRole('alert')
          .filter({hasText: gaveUp, has: page.getByRole('button', {name: 'Dismiss'})})
        await expect(gaveUpNotice).toBeVisible()
        await expect(composer).toHaveText('')
      } finally {
        refusing.value = false
        kit.harness.script.release()
      }
    })

    test('a queue lost while the pane is away is kept as the draft when its draft read was held from mount and then failed', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      const kit = suite.kit()
      const away = await kit.rpc.sessions.create()
      const awayTitle = `draft read held ${away.sessionId.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: away.sessionId, title: awayTitle})
      const draftRead = await gateRpcCalls(page, {path: ['drafts', 'get'], onRelease: 'cut'})
      const refusing = {value: false}
      const chatSockets: WebSocketRoute[] = []
      await page.routeWebSocket(
        (url) => url.pathname.endsWith(CHAT_WS_PATH),
        (socket) => {
          if (refusing.value) return socket.close()
          chatSockets.push(socket)
          socket.connectToServer()
        },
      )
      const sessionId = SessionId.parse(await openPanelOnNewSession(page, suite))
      const title = `session under test ${sessionId.slice(-12)}`
      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      const composer = chatBox(page)
      const stop = panel.getByRole('button', {name: 'Stop generating'})
      const queued = panel.getByRole('listitem').filter({hasText: QUEUED_TEXT})
      const failingReads: {dispose: () => Promise<void>}[] = []
      kit.harness.script.hold()
      try {
        await draftRead.awaitCaptured(1)
        await composer.click()
        await composer.pressSequentially(RUNNING_TEXT)
        await page.keyboard.press('Enter')
        await expect(stop).toBeVisible()
        await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1)
        await composer.click()
        await composer.pressSequentially(QUEUED_TEXT)
        await page.keyboard.press('Enter')
        await expect(queued).toBeVisible()

        await switchToSessionByTitle(page, awayTitle)
        await expect(chatLog(page).getByText(RUNNING_TEXT)).toHaveCount(0)
        failingReads.push(await failRpcCalls(page, {path: ['drafts', 'get']}))
        await draftRead.dispose()
        refusing.value = true
        await Promise.all(chatSockets.splice(0).map((socket) => socket.close()))
        await until(async () => (await kit.rpc.drafts.get({sessionId}))?.text === QUEUED_TEXT, {
          hangGuardMs: 60_000,
          intervalMs: 100,
        })
        refusing.value = false
        kit.harness.script.release()

        await switchToSessionByTitle(page, title)
        await expect(composer).toHaveText(QUEUED_TEXT)
        await expect(queued).toBeHidden()
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(0)
      } finally {
        refusing.value = false
        kit.harness.script.release()
        await draftRead.dispose()
        for (const fault of failingReads) await fault.dispose()
      }
    })
  })
})

test.describe('host hotkey isolation', () => {
  const HOST_SEARCH_HOTKEY = `
  <button type="button">Host focus target</button>
  <button type="button">Host next target</button>
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
    host = await serveWidgetHost(() =>
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

    test('Tab pressed with focus on the host page moves to the next host control, never into the open panel', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await openPanelOnNewSession(page, suite)
      await expect(composer(page)).toBeVisible()

      await page.getByRole('button', {name: 'Host focus target'}).click()
      await page.keyboard.press('Tab')

      const next = page.getByRole('button', {name: 'Host next target'})
      await expect(next).toBeFocused({timeout: 5_000})
      await expect(next.and(page.locator(':focus-visible'))).toBeVisible({timeout: 5_000})
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
      const wire = await watchRpcWire(page)
      const hold = await holdRpcCalls(page)
      await openLoggedIn(page, suite.kit(), suite.host().base)
      await openChatPanel(page)
      await wire.sessionsBootTraffic()

      await hold.hold()

      const notice = page.getByText('conciv lost connection to the engine.')
      await expect(notice).toBeVisible({timeout: UNREACHABLE_TIMEOUT_MS})

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
    host = await serveWidgetHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
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
      await openLoggedIn(page, kit, host.base)
      await openChatPanel(page)

      const composer = chatBox(page)
      await composer.fill('a message queued during the outage')

      await hold.hold()

      const notice = page.getByText('conciv lost connection to the engine.')
      await expect(notice).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      const disabledSend = page.getByRole('button', {name: 'conciv lost connection to the engine'})
      await expect(disabledSend).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      await expect(disabledSend).toBeDisabled()

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

    test('offers a retry when the model menu fails to load and recovers on retry', async ({page}) => {
      test.setTimeout(180_000)
      const models = await failRpcCalls(page, {path: ['meta', 'models']})
      await openLoggedIn(page, suite.kit(), suite.host().base)
      await openPanel(page)

      await page.getByRole('button', {name: 'Couldn’t load models', exact: true}).click()
      const retry = page.getByRole('button', {name: 'Couldn’t load models: Retry loading models'})
      await expect(retry).toBeVisible({timeout: 30_000})

      models.repair()
      await retry.click()
      await expect(page.getByRole('option', {name: /^Claude Sonnet 4\.5/, selected: true})).toBeVisible({
        timeout: 30_000,
      })
      await expect(page.getByRole('textbox', {name: 'Search models'})).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', {name: 'Model: Claude Sonnet 4.5'})).toBeVisible({timeout: 30_000})
    })
  })
})

test.describe('mount ready', () => {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    kit = await bootEmbedKit({text: 'ready contract'})
    host = await serveWidgetHost(() => handleHostPage())
  })

  test.afterAll(async () => {
    await host.close()
    await kit.cleanup()
  })

  async function openPage(page: Page): Promise<Page> {
    await openLoggedIn(page, kit, host.base)
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
      }, browserBase(kit.base))
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

  function findGrabPayload(draft: DraftRow): GrabPayload | null {
    const attachment = draft.attachments.find((candidate) => candidate.contentType === GRAB_MIME)
    if (!attachment) return null
    return parseGrabPayload(Buffer.from(attachment.data, 'base64').toString('utf8'))
  }

  let kit: CoreKit
  let sessionId: string

  test.beforeAll(async () => {
    kit = await bootCoreKit({id: 'fake-native', text: 'Hello from conciv', nativePageDir: nativeDistDir})
    sessionId = (await kit.rpc.sessions.create()).sessionId
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
      const wire = await watchRpcWire(fixturePage)
      const {page} = await openNative(fixturePage)
      await wire.sessionsBootTraffic()
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
      const wire = await watchRpcWire(fixturePage)
      const {page, bridge} = await openNative(fixturePage)
      await wire.sessionsBootTraffic()
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
      await untilPanelDraft(page, kit, sessionId, (draft) => {
        const payload = findGrabPayload(draft)
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

  async function pageCall(kit: EmbedKit, method: string, input: Record<string, unknown> = {}): Promise<unknown> {
    return kit.rpc.plugin.call({rpcId: 'experimental.page', method, input: {sessionId: await kit.session(), ...input}})
  }

  async function pageRun(kit: EmbedKit, {type, ...input}: {type: string} & Record<string, unknown>): Promise<unknown> {
    const sessionId = await kit.session()
    return makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}}).registry.call({
      name: `page_${type}`,
      input,
    })
  }

  async function expectClickDispatched(kit: EmbedKit, page: Page): Promise<void> {
    await expect(pageRun(kit, {type: 'click', selector: '#press-btn'})).resolves.toMatchObject({ok: true})
    await expect(pageRun(kit, {type: 'text', selector: '#clicked-flag'})).resolves.toMatchObject({text: 'clicked'})
    const changes = ChangesSchema.parse(await pageCall(kit, 'changes'))
    expect(changes.map((entry) => entry.verb)).toContain('page_click')
    await expect(page.getByRole('img', {name: "Agent's cursor"})).toHaveCount(1, {timeout: 10_000})
  }

  test.describe('bootNormal: the widget embed serves page tools through the dispatcher', () => {
    let kit: EmbedKit
    let host: {base: string; close: () => Promise<void>}
    let page: Page

    test.beforeAll(async ({browser}) => {
      kit = await bootEmbedKit()
      host = await serveWidgetHost(() =>
        hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}),
      )
      page = await browser.newPage()
      await openPagePlaneHost(page, kit, host.base)
      const shown = await kit.session()
      const title = `page dispatch ${shown.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: shown, title})
      await openPanel(page)
      await switchToSessionByTitle(page, title)
    })

    test.afterAll(async () => {
      await page.close()
      await host.close()
      await kit.cleanup()
    })

    test('act: page_click acts on the page, journals, and shows the agent cursor, and two clicks on the page stop the agent', async () => {
      await expectClickDispatched(kit, page)
      const agentMask = page.getByRole('status', {name: 'Agent is using this page'})
      await agentMask.click()
      await agentMask.click()
      await expect(agentMask).toBeHidden()
    })

    test('page reload: a page_reload run from the chat resolves on initiation and the page really reloads', async () => {
      const sessionId = await kit.session()
      await page.getByRole('button', {name: 'Press target'}).click()
      await expect(page.getByText('clicked', {exact: true})).toBeVisible()
      const toolCallId = kit.harness.script.scriptToolCall('execute_typescript', {
        typescriptCode: 'return await external_page_reload({})',
      })
      await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('reload the page')
      await page.getByRole('button', {name: 'Send message'}).click()
      await expect(page.getByText('clicked', {exact: true})).toBeHidden()
      await expect(page.getByRole('button', {name: 'Press target'})).toBeVisible()
      await expect
        .poll(async () => {
          const {messages} = await kit.rpc.chat.hydrate({sessionId})
          return messages
            .flatMap((message) =>
              message.parts.flatMap((part) =>
                part.type === 'tool-result' && part.toolCallId === toolCallId ? [part.content] : [],
              ),
            )
            .join('\n')
        })
        .toContain('"initiated":true')
    })
  })

  test.describe('bootConnect: the connect handle serves page tools through the dispatcher', () => {
    let kit: EmbedKit
    let host: {base: string; close: () => Promise<void>}
    let page: Page

    test.beforeAll(async ({browser}) => {
      kit = await bootEmbedKit()
      host = await serveWidgetHost(() => handleHostPage(HOST_BODY))
      page = await browser.newPage()
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await page.evaluate(() => {
        const el = document.createElement('div')
        document.body.appendChild(el)
        window.concivTestHandle = window.ConcivHandle.makeConnectHandle()
        void window.concivTestHandle.mount(el)
      })
      const shown = await kit.session()
      const title = `page dispatch ${shown.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: shown, title})
      await completeConnectHandshake(page, kit.base, shown, () => switchToSessionByTitle(page, title))
    })

    test.afterAll(async () => {
      await page.close()
      await host.close()
      await kit.cleanup()
    })

    test('act: page_click acts on the page, journals, and shows the agent cursor, and two clicks on the page stop the agent', async () => {
      await expectClickDispatched(kit, page)
      const agentMask = page.getByRole('status', {name: 'Agent is using this page'})
      await agentMask.click()
      await agentMask.click()
      await expect(agentMask).toBeHidden()
    })

    test('page_effect enable shows the highlight inspector the page plugin registers, disable reverts, toggle flips', async () => {
      await expect(pageRun(kit, {type: 'effect', action: 'enable', effect: 'highlight'})).resolves.toMatchObject({
        effect: 'highlight',
        enabled: true,
      })
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(1, {timeout: 10_000})

      await expect(pageRun(kit, {type: 'effect', action: 'disable', effect: 'highlight'})).resolves.toMatchObject({
        effect: 'highlight',
        enabled: false,
      })
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(0, {timeout: 10_000})

      await expect(pageRun(kit, {type: 'effect', action: 'toggle', effect: 'highlight'})).resolves.toMatchObject({
        effect: 'highlight',
        enabled: true,
      })
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(1, {timeout: 10_000})

      await expect(pageRun(kit, {type: 'effect', action: 'toggle', effect: 'highlight'})).resolves.toMatchObject({
        effect: 'highlight',
        enabled: false,
      })
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(0, {timeout: 10_000})
    })

    test('holding Alt and clicking a page element with no source says so', async () => {
      const hint = page.getByRole('status').filter({hasText: 'Inspecting'})
      const probe = page.getByText('page-bus-ok')

      await probe.click()
      await expect(hint).toHaveCount(0)
      await page.keyboard.down('Alt')
      await expect(hint).toBeVisible({timeout: 10_000})
      await probe.hover({force: true})
      await probe.click({force: true})
      await expect(page.getByText('No source for this element')).toBeVisible({timeout: 10_000})
      await page.keyboard.up('Alt')
      await expect(hint).toHaveCount(0)
    })
  })

  test.describe('a tab open on a session when it is deleted', () => {
    const AttachedSchema = z.array(z.string())
    let kit: EmbedKit
    let host: {base: string; close: () => Promise<void>}
    let page: Page
    let title: string
    let wire: RpcObserver

    test.beforeAll(async ({browser}) => {
      kit = await bootEmbedKit()
      host = await serveWidgetHost(() =>
        hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}),
      )
      page = await browser.newPage()
      wire = rpcObserverFor(page)
      await rpcSocketFor(page).installed
      await openPagePlaneHost(page, kit, host.base)
      const shown = await kit.session()
      title = `deleted while open ${shown.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: shown, title})
      await openPanel(page)
      await switchToSessionByTitle(page, title)
    })

    test.afterAll(async () => {
      await page.close()
      await host.close()
      await kit.cleanup()
    })

    test('a click after the delete is refused on the wire, and after a reload the id is in no list', async () => {
      const deleted = await kit.session()
      const attach = {
        path: ['plugin', 'call'],
        input: {rpcId: 'experimental.page', method: 'attach', input: {sessionId: deleted}},
      }
      await expect(pageRun(kit, {type: 'text', selector: '#probe'})).resolves.toMatchObject({text: 'page-bus-ok'})
      const ended = wire.completed(attach)
      await kit.rpc.sessions.delete({sessionId: deleted})
      await ended
      const since = wire.mark()
      await page.getByText('page-bus-ok').click()
      const refused = await wire.completed({...attach, since})
      expect(refused.output).toMatchObject({message: `session "${deleted}" does not exist`, data: {type: 'missing'}})
      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(page.getByRole('region', {name: 'Deleted session'}).getByRole('status')).toHaveText(
        'This session was deleted.',
        {timeout: 30_000},
      )
      const attached = AttachedSchema.parse(
        await kit.rpc.plugin.call({rpcId: 'experimental.page', method: 'sessions.attached', input: {}}),
      )
      expect(attached).not.toContain(deleted)
      const {sessions} = await kit.rpc.sessions.list(undefined)
      expect(sessions.map((session) => session.id)).not.toContain(deleted)
    })
  })

  test.describe('a tab nobody touches while the engine restarts', () => {
    const AttachedSchema = z.array(z.string())
    let kit: EmbedKit
    let host: {base: string; close: () => Promise<void>}
    let page: Page

    test.beforeAll(async ({browser}) => {
      kit = await bootEmbedKit()
      host = await serveWidgetHost(() =>
        hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}),
      )
      page = await browser.newPage()
      await openPagePlaneHost(page, kit, host.base)
      const shown = await kit.session()
      const title = `restart untouched ${shown.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: shown, title})
      await openPanel(page)
      await switchToSessionByTitle(page, title)
    })

    test.afterAll(async () => {
      await page.close()
      await host.close()
      await kit.cleanup()
    })

    test('attaches again by itself once the engine is back, and a page tool reads the page', async () => {
      const sessionId = await kit.session()
      const attachedNow = () =>
        kit.rpc.plugin
          .call({rpcId: 'experimental.page', method: 'sessions.attached', input: {}})
          .then((attached) => AttachedSchema.parse(attached))
      await expect(pageRun(kit, {type: 'text', selector: '#probe'})).resolves.toMatchObject({text: 'page-bus-ok'})
      await kit.restartServer()
      await expect.poll(attachedNow, {timeout: 30_000}).toContain(sessionId)
      await expect(pageRun(kit, {type: 'text', selector: '#probe'})).resolves.toMatchObject({text: 'page-bus-ok'})
    })
  })

  test.describe('a tab open on a new session before its first send', () => {
    const AttachedSchema = z.array(z.string())
    const draft = SessionId.parse(`conciv_${crypto.randomUUID()}`)
    let kit: EmbedKit
    let host: {base: string; close: () => Promise<void>}
    let page: Page
    let wire: RpcObserver

    test.beforeAll(async ({browser}) => {
      kit = await bootEmbedKit()
      await kit.rpc.navigation.set({entries: [{href: `/panel/${draft}?open=true`}], index: 0, updatedAt: Date.now()})
      host = await serveWidgetHost(() =>
        hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}),
      )
      page = await browser.newPage()
      wire = rpcObserverFor(page)
      await rpcSocketFor(page).installed
      await openPagePlaneHost(page, kit, host.base)
      await openPanel(page)
    })

    test.afterAll(async () => {
      await page.close()
      await host.close()
      await kit.cleanup()
    })

    test('is refused and makes no session, then attaches once the first send makes it, and a page tool in the next run reads the page', async () => {
      const attachedNow = () =>
        kit.rpc.plugin
          .call({rpcId: 'experimental.page', method: 'sessions.attached', input: {}})
          .then((attached) => AttachedSchema.parse(attached))
      const refused = await wire.completed({
        path: ['plugin', 'call'],
        input: {rpcId: 'experimental.page', method: 'attach', input: {sessionId: draft}},
      })
      expect(refused.output).toMatchObject({message: `session "${draft}" does not exist`, data: {type: 'missing'}})
      expect((await kit.rpc.sessions.list(undefined)).sessions.map((session) => session.id)).not.toContain(draft)
      expect(await attachedNow()).not.toContain(draft)
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      const firstRunFinished = async () => {
        const {activeRun, lastRun} = await kit.rpc.chat.hydrate({sessionId: draft})
        return activeRun === null && lastRun !== null && lastRun.finishedAt !== null
      }
      await composer.fill('start the session')
      await page.getByRole('button', {name: 'Send message'}).click()
      await expect.poll(attachedNow).toContain(draft)
      await expect.poll(firstRunFinished, {timeout: 30_000}).toBe(true)
      const toolCallId = kit.harness.script.scriptToolCall('execute_typescript', {
        typescriptCode: "return await external_page_text({selector: '#probe'})",
      })
      await composer.fill('read the probe')
      await page.getByRole('button', {name: 'Send message'}).click()
      const toolResults = async () => {
        const {messages} = await kit.rpc.chat.hydrate({sessionId: draft})
        return messages
          .flatMap((message) =>
            message.parts.flatMap((part) =>
              part.type === 'tool-result' && part.toolCallId === toolCallId ? [part.content] : [],
            ),
          )
          .join('\n')
      }
      await expect.poll(toolResults, {timeout: 30_000}).toContain('page-bus-ok')
    })
  })

  test.describe('a tab on an existing session whose page permissions could not be granted', () => {
    const AttachedSchema = z.array(z.string())
    let kit: EmbedKit
    let host: {base: string; close: () => Promise<void>}
    let page: Page
    let wire: RpcObserver
    let database: DatabaseSync
    let existing: string

    test.beforeAll(async ({browser}) => {
      kit = await bootEmbedKit()
      existing = await kit.session()
      database = new DatabaseSync(join(concivStateDir(kit.stateRoot), 'conciv.db'))
      database.exec(
        `CREATE TRIGGER refuse_page_grant BEFORE UPDATE OF permissions ON sessions WHEN NEW.id = '${SessionId.parse(existing)}' BEGIN SELECT RAISE(ABORT, 'disk full'); END`,
      )
      await kit.rpc.navigation.set({entries: [{href: `/panel/${existing}?open=true`}], index: 0, updatedAt: Date.now()})
      host = await serveWidgetHost(() =>
        hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}),
      )
      page = await browser.newPage()
      wire = rpcObserverFor(page)
      await rpcSocketFor(page).installed
      await openPagePlaneHost(page, kit, host.base)
      await openPanel(page)
    })

    test.afterAll(async () => {
      database.close()
      await page.close()
      await host.close()
      await kit.cleanup()
    })

    test('is refused, then attaches by itself once the grant can be written, and a page tool reads the page', async () => {
      const attachedNow = () =>
        kit.rpc.plugin
          .call({rpcId: 'experimental.page', method: 'sessions.attached', input: {}})
          .then((attached) => AttachedSchema.parse(attached))
      const refused = await wire.completed({
        path: ['plugin', 'call'],
        input: {rpcId: 'experimental.page', method: 'attach', input: {sessionId: existing}},
      })
      expect(refused.output).toMatchObject({message: 'Page permissions could not be granted.'})
      expect(await attachedNow()).not.toContain(existing)
      database.exec('DROP TRIGGER refuse_page_grant')
      await expect.poll(attachedNow, {timeout: 30_000}).toContain(existing)
      await expect(pageRun(kit, {type: 'text', selector: '#probe'})).resolves.toMatchObject({text: 'page-bus-ok'})
    })
  })

  test.describe('conciv tools page eval in a headless run, with nobody at the tab', () => {
    const conciv = fileURLToPath(import.meta.resolve('@conciv/cli/bin'))
    const EVAL = "document.getElementById('probe').textContent = 'evaluated'"
    type HeadlessTab = {kit: EmbedKit; host: {base: string; close: () => Promise<void>}; page: Page}
    let refused: HeadlessTab
    let allowed: HeadlessTab

    const openTab = async (browser: Browser, options: Parameters<typeof bootEmbedKit>[0]): Promise<HeadlessTab> => {
      const kit = await bootEmbedKit(options)
      const host = await serveWidgetHost(() =>
        hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}),
      )
      const page = await browser.newPage()
      await openPagePlaneHost(page, kit, host.base)
      const shown = await kit.session()
      const title = `headless eval ${shown.slice(-12)}`
      await kit.rpc.sessions.rename({sessionId: shown, title})
      await openPanel(page)
      await switchToSessionByTitle(page, title)
      return {kit, host, page}
    }

    const closeTab = async ({kit, host, page}: HeadlessTab) => {
      await page.close()
      await host.close()
      await kit.cleanup()
    }

    const toolsPage = async (kit: EmbedKit, args: string[], sessionId?: string) => {
      const {port, pathname} = new URL(kit.base)
      const env = {
        CONCIV_HOME: kit.home,
        CONCIV_SESSION_ID: sessionId ?? (await kit.session()),
        CONCIV_PORT: port,
        CONCIV_TOKEN: pathname.replace(/^\/t\//, ''),
      }
      return new Promise<{code: unknown; document: unknown}>((resolve) =>
        execFile(process.execPath, [conciv, 'tools', 'page', ...args], {cwd: kit.stateRoot, env}, (error, stdout) =>
          resolve({code: error === null ? 0 : error.code, document: JSON.parse(stdout)}),
        ),
      )
    }

    const askRefusal = {
      code: 1,
      document: {
        ok: false,
        error: {
          kind: 'user',
          code: 'APPROVAL_DENIED',
          message: `Tool "page_eval" needs the user's approval. The request is shown to the user; retry once they approve it.`,
        },
      },
    }
    let denied: EmbedKit
    let blanket: EmbedKit
    let otherAction: EmbedKit

    test.beforeAll(async ({browser}) => {
      refused = await openTab(browser, {})
      allowed = await openTab(browser, {permission: {page_eval: 'allow'}})
      denied = await bootEmbedKit({permission: {page_eval: 'deny'}})
      blanket = await bootEmbedKit({permission: 'allow'})
      otherAction = await bootEmbedKit({permission: {page_click: 'allow'}})
    })

    test.afterAll(async () => {
      await closeTab(refused)
      await closeTab(allowed)
      await denied.cleanup()
      await blanket.cleanup()
      await otherAction.cleanup()
    })

    test('with no rule in the host config, eval fails at once asking for approval and the page is untouched', async () => {
      const {kit, page} = refused
      await expect(pageRun(kit, {type: 'text', selector: '#probe'})).resolves.toMatchObject({text: 'page-bus-ok'})
      expect(await toolsPage(kit, ['eval', '--code', EVAL])).toEqual({
        code: 1,
        document: {
          ok: false,
          error: {
            kind: 'user',
            code: 'APPROVAL_DENIED',
            message: `Tool "page_eval" needs the user's approval. The request is shown to the user; retry once they approve it.`,
          },
        },
      })
      await expect(page.getByText('page-bus-ok', {exact: true})).toBeVisible()
    })

    test('with page_eval allowed in the host config, eval runs with no click and the page shows its effect', async () => {
      const {kit, page} = allowed
      await expect(pageRun(kit, {type: 'text', selector: '#probe'})).resolves.toMatchObject({text: 'page-bus-ok'})
      expect(await toolsPage(kit, ['eval', '--code', EVAL])).toEqual({
        code: 0,
        document: {ok: true, data: {result: 'evaluated'}},
      })
      await expect(page.getByText('evaluated', {exact: true})).toBeVisible()
    })

    test('only a page_eval rule decides eval, and an allowed eval still needs an attached tab', async () => {
      expect.soft(await toolsPage(denied, ['eval', '--code', EVAL])).toEqual({
        code: 1,
        document: {
          ok: false,
          error: {kind: 'user', code: 'APPROVAL_DENIED', message: 'Permission denied: page_eval'},
        },
      })
      expect.soft(await toolsPage(blanket, ['eval', '--code', EVAL])).toEqual(askRefusal)
      expect.soft(await toolsPage(otherAction, ['eval', '--code', EVAL])).toEqual(askRefusal)
      const {sessionId} = await allowed.kit.rpc.sessions.create()
      expect.soft(await toolsPage(allowed.kit, ['eval', '--code', EVAL], sessionId)).toEqual({
        code: 1,
        document: {
          ok: false,
          error: {
            kind: 'user',
            code: 'NO_PAGE_CLIENT',
            message: 'page_eval: the page is showing another session; switch back to this session to use page tools',
          },
        },
      })
    })
  })
})

test.describe('panel focus', () => {
  const suite = setupWidgetSuite()

  const COMPOSER_NAME = 'Message the conciv agent'
  const SESSIONS_LIST = ['sessions', 'list'] as const

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

  type HostedPanel = {host: Awaited<ReturnType<typeof serveWidgetHost>>; page: Page; hostButton: Locator}

  const dedicatedHosts: Array<{close: () => Promise<void>}> = []

  test.afterEach(async () => {
    for (const dedicatedHost of dedicatedHosts.splice(0)) await dedicatedHost.close()
  })

  async function openPanelOverFocusedHostButton(page: Page): Promise<HostedPanel> {
    const host = await serveWidgetHost(() =>
      hostPage({
        apiBase: suite.kit().base,
        widget: '{"quickTerminal":false}',
        body: '<button id="host-action">Host action</button>',
      }),
    )
    dedicatedHosts.push(host)
    await openLoggedIn(page, suite.kit(), host.base)
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
      await openLoggedIn(page, suite.kit(), suite.host().base)
      await openPanel(page)
      await expect(composer(page)).toBeFocused({timeout: 10_000})
      await page.keyboard.type('typed without clicking')
      await expect(composer(page)).toHaveText('typed without clicking')
    })

    test('paints the shell while the session list is still loading, then focuses the composer', async ({page}) => {
      test.setTimeout(90_000)
      const host = await serveWidgetHost(() =>
        hostPage({apiBase: suite.kit().base, widget: '{"quickTerminal":false,"transport":"fetch"}'}),
      )
      dedicatedHosts.push(host)
      const sessionListGate = await gateRpcCalls(page, {path: SESSIONS_LIST})
      await openLoggedIn(page, suite.kit(), host.base)
      try {
        await sessionListGate.awaitCaptured(1)
        await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 15_000})
        expect(sessionListGate.pending()).toBeGreaterThan(0)
      } finally {
        await sessionListGate.dispose()
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
      await openLoggedIn(page, suite.kit(), suite.host().base)
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
      const host = await serveWidgetHost(() =>
        hostPage({
          apiBase: suite.kit().base,
          widget: '{"quickTerminal":false}',
          body: '<input aria-label="Host search" autofocus>',
        }),
      )
      dedicatedHosts.push(host)
      await openLoggedIn(page, suite.kit(), host.base)
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
  const TYPED_TEXT = 'typed once logged in'
  const REFUSED_TEXT = 'typed while logged out'
  const RUNNING_TEXT = 'keep this run going'
  const QUEUED_TEXT = 'steer toward this instead'
  const STARTER_TEXT = 'Explain this page'
  const LOGGED_OUT_SENTENCE = 'Log in to use conciv on this page.'
  const REVOKED_SENTENCE = 'This browser is no longer authorized to use conciv.'
  const STREAM_READ_FAILED = 'Stream response body read failed'
  const RUN_FAILED = 'upstream is overloaded'
  const FAILING_TEXT = 'this run fails upstream'

  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit({text: ASSISTANT_TEXT})
    host = await serveWidgetHost(() => handleHostPage())
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
      await openLoggedIn(page, kit, host.base)

      await mountHandle(page, proxyA.base)
      await openChatPanel(page)

      const apiBaseProbe = page.getByRole('status', {name: 'host api base probe'})
      await expect(apiBaseProbe).toHaveText(browserBase(proxyA.base), {timeout: 30_000})

      await until(async () => (await panelSession()) !== null, {hangGuardMs: 30_000, intervalMs: 100})
      const sessionBefore = await panelSession()
      expect(sessionBefore).not.toBeNull()

      await sendChatMessage(page, USER_TEXT)
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

      const renamed = `renamed before the drift ${String(sessionBefore).slice(-8)}`
      await kit.rpc.sessions.rename({sessionId: SessionId.parse(sessionBefore), title: renamed})
      const beforeB = proxyB.trafficCount()
      await rebindHandle(page, proxyB.base)
      await proxyA.close()
      await logInFromPanelNotice(page, kit, 'Log in to use conciv on this page.')

      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(chatBox(page)).toBeVisible({timeout: 30_000})

      await expect(apiBaseProbe).toHaveText(browserBase(proxyB.base), {timeout: 30_000})
      await page.getByRole('button', {name: 'Session options'}).click()
      await expect(page.getByRole('button', {name: `Session: ${renamed}`})).toBeVisible({timeout: 30_000})
      await page.keyboard.press('Escape')

      await expect(chatLog(page).getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})
      const reboundPanel = page.getByRole('dialog', {name: 'conciv chat agent'})
      await expect(reboundPanel.getByText('this connection is not trusted')).toHaveCount(0)
      await expect(reboundPanel.getByRole('button', {name: 'Retry'})).toHaveCount(0)

      await sendChatMessage(page, SECOND_USER_TEXT)
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: 30_000})
      await expect(chatLog(page).getByText(SECOND_USER_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(chatLog(page).getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})

      expect(proxyB.trafficCount()).toBeGreaterThan(beforeB)
      expect(await panelSession()).toBe(sessionBefore)
      expect(sessionBefore).not.toBeNull()
      expect(pageErrors).toEqual([])
    })

    test('an empty conversation that failed to load on the untrusted port keeps a read-only composer and loads by itself after login', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      await openLoggedIn(page, kit, host.base)
      await mountHandle(page, proxyA.base)
      await openChatPanel(page)

      await rebindHandle(page, proxyB.base)
      await proxyA.close()
      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      const loginNotice = panel.getByRole('alert').filter({hasText: 'Log in to use conciv on this page.'})
      const loadFailed = panel.getByText('Couldn’t load this conversation')
      await expect(loginNotice).toBeVisible({timeout: 30_000})
      await expect(loadFailed).toBeVisible({timeout: 30_000})

      const composer = chatBox(page)
      const loggedOutSend = panel.getByRole('button', {name: LOGGED_OUT_SENTENCE, exact: true})
      await expect(panel.getByRole('textbox', {name: 'Message the conciv agent', disabled: true})).toBeVisible()
      await expect(panel.getByText('Log in to continue', {exact: true})).toBeVisible()
      await composer.click({force: true})
      await page.keyboard.type(REFUSED_TEXT)
      await expect(composer).toHaveText('')
      await expect(loggedOutSend).toBeDisabled({timeout: 30_000})
      await expect(chatLog(page).getByText(REFUSED_TEXT)).toHaveCount(0)
      await expect(panel.getByText(STREAM_READ_FAILED)).toHaveCount(0)

      await logInFromPanelNotice(page, kit, 'Log in to use conciv on this page.')
      await expect(loginNotice).toBeHidden({timeout: 30_000})
      await expect(loadFailed).toBeHidden({timeout: 30_000})
      await expect(chatBox(page)).toBeVisible({timeout: 30_000})

      const send = panel.getByRole('button', {name: 'Send message', exact: true})
      await expect(panel.getByRole('textbox', {name: 'Message the conciv agent', disabled: false})).toBeVisible()
      await composer.click()
      await composer.pressSequentially(TYPED_TEXT)
      await expect(composer).toHaveText(TYPED_TEXT)
      await expect(send).toBeEnabled({timeout: 30_000})

      const starter = panel.getByRole('button', {name: STARTER_TEXT})
      const revokedNotice = panel.getByRole('alert').filter({hasText: REVOKED_SENTENCE})
      const revokedRefusal = page.getByRole('status').filter({hasText: REVOKED_SENTENCE})
      await expect(starter).toBeVisible({timeout: 30_000})
      revokeBrowsers(concivStateDir(kit.stateRoot), 'all')
      await expect(revokedNotice).toBeVisible({timeout: 30_000})
      await expect(revokedRefusal).toHaveCount(0)
      await starter.click()
      await expect(revokedRefusal.getByText(REVOKED_SENTENCE, {exact: true})).toBeVisible({timeout: 30_000})
      await expect(starter).toBeVisible()
      await expect(composer).toHaveText(TYPED_TEXT)
      await revokedRefusal.getByRole('button', {name: 'Dismiss'}).click()
      await expect(revokedRefusal).toHaveCount(0)

      await logInFromPanelNotice(page, kit, REVOKED_SENTENCE)
      await expect(revokedNotice).toBeHidden({timeout: 30_000})
      await starter.click()
      await expect(chatLog(page).getByText(STARTER_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

      await expect(composer).toHaveText(TYPED_TEXT)
      await composer.click()
      await page.keyboard.press('Enter')
      await expect(chatLog(page).getByText(TYPED_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: 30_000})
      await expect(panel.getByText('Couldn’t load this conversation')).toHaveCount(0)
      await expect(panel.getByText('this connection is not trusted')).toHaveCount(0)
      await expect(panel.getByText(STREAM_READ_FAILED)).toHaveCount(0)
      await expect(panel.getByRole('button', {name: 'Retry'})).toHaveCount(0)

      const queued = panel.getByRole('listitem').filter({hasText: QUEUED_TEXT})
      const steer = queued.getByRole('button', {name: 'Steer'})
      const stop = panel.getByRole('button', {name: 'Stop generating'})
      kit.harness.script.hold()
      try {
        await composer.click()
        await composer.pressSequentially(RUNNING_TEXT)
        await page.keyboard.press('Enter')
        await expect(stop).toBeVisible({timeout: 30_000})
        await expect(chatLog(page).getByText(RUNNING_TEXT)).toHaveCount(1, {timeout: 30_000})
        await composer.click()
        await composer.pressSequentially(QUEUED_TEXT)
        await page.keyboard.press('Enter')
        await expect(queued).toBeVisible({timeout: 30_000})

        const steerLoginCode = await requestLoginCode(kit)
        revokeBrowsers(concivStateDir(kit.stateRoot), 'all')
        await expect(revokedNotice).toBeVisible({timeout: 30_000})
        await expect(revokedRefusal).toHaveCount(0)
        await steer.click()
        await expect(revokedRefusal.getByText(REVOKED_SENTENCE, {exact: true})).toBeVisible({timeout: 30_000})
        await expect(queued).toBeVisible()
        await expect(steer).toBeEnabled()
        await expect(stop).toBeVisible()
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(0)

        await logInFromPanelNoticeWithCode(page, REVOKED_SENTENCE, steerLoginCode)
        await expect(revokedNotice).toBeHidden({timeout: 30_000})
        await steer.click()
        await expect(queued).toBeHidden({timeout: 30_000})
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(1, {timeout: 30_000})
      } finally {
        kit.harness.script.release()
      }
      await expect(stop).toBeHidden({timeout: 30_000})
      await expect(send).toBeVisible({timeout: 30_000})

      const refresh = panel
        .getByRole('toolbar', {name: 'Message actions'})
        .first()
        .getByRole('button', {name: 'Refresh'})
      const retry = panel.getByRole('alert').filter({hasText: RUN_FAILED}).getByRole('button', {name: 'Retry'})
      kit.harness.script.scriptError(RUN_FAILED)
      await composer.click()
      await composer.pressSequentially(FAILING_TEXT)
      await page.keyboard.press('Enter')
      await expect(retry).toBeVisible({timeout: 30_000})
      await expect(refresh).toBeEnabled()

      const resendLoginCode = await requestLoginCode(kit)
      revokeBrowsers(concivStateDir(kit.stateRoot), 'all')
      await expect(revokedNotice).toBeVisible({timeout: 30_000})
      await expect(retry).toHaveCount(0)
      await expect(refresh).toBeDisabled()

      await logInFromPanelNoticeWithCode(page, REVOKED_SENTENCE, resendLoginCode)
      await expect(revokedNotice).toBeHidden({timeout: 30_000})
      await expect(retry).toBeVisible({timeout: 30_000})
      await expect(refresh).toBeEnabled()
    })
  })

  test.describe('handle.rebind to an engine with no browser plugins', () => {
    const PLUGIN_TEXT = 'Drawn by the first engine plugin'
    let pluginKit: CoreKit

    test.beforeEach(async () => {
      pluginKit = await bootCoreKit({
        id: 'fake-embed',
        text: ASSISTANT_TEXT,
        plugins: ['./panel-end'],
        files: {
          'panel-end/index.ts': `export default {id: 'panel-end', async setup() {}}
`,
          'panel-end/plugin-experimental.js': `const {Slot} = require('@conciv/plugin/experimental')
module.exports = {default: {setup(ctx) {
  ctx.add(Slot, {at: 'session.panel.end', render: () => Object.assign(document.createElement('span'), {textContent: '${PLUGIN_TEXT}'})})
}}}
`,
        },
      })
    })

    test.afterEach(async () => {
      await pluginKit.cleanup()
    })

    test('the first engine plugin view is gone once the widget is bound to the second engine', async ({page}) => {
      test.setTimeout(240_000)
      await openLoggedIn(page, pluginKit, host.base)
      await mountHandle(page, pluginKit.base)
      await openChatPanel(page)
      const bar = page.getByRole('toolbar', {name: 'Session status'})
      await expect(bar.getByText(PLUGIN_TEXT, {exact: true})).toBeVisible({timeout: 30_000})

      await rebindHandle(page, kit.base)
      await logInFromPanelNotice(page, kit, LOGGED_OUT_SENTENCE)
      await expect(page.getByRole('alert').filter({hasText: LOGGED_OUT_SENTENCE})).toHaveCount(0, {timeout: 30_000})
      await sendChatMessage(page, USER_TEXT)
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})
      await expect(bar.getByRole('tab', {name: 'Chat'})).toBeVisible({timeout: 30_000})
      await expect(bar.getByText(PLUGIN_TEXT, {exact: true})).toHaveCount(0, {timeout: 30_000})
    })
  })
})

test.describe('reload continuity', () => {
  const ASSISTANT_TEXT = 'Continuity reply'

  const suite = setupWidgetSuite({text: ASSISTANT_TEXT, imageInput: 'native', terminal: true})

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
      await untilPanelDraft(page, suite.kit(), sessionId, (draft) => draft.text === 'an unsent draft survives')

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

    test('the session menu state a reload restores is the one on screen right before it', async ({page}) => {
      test.setTimeout(240_000)
      const sessionId = await openPanelOnNewSession(page, suite)
      const title = `session under test ${sessionId.slice(-12)}`
      const sessionPicker = page.getByRole('button', {name: /^Session: /})

      await page.getByRole('button', {name: 'Session options'}).click()
      await expect(sessionPicker).toBeVisible()
      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(sessionPicker).toBeVisible()

      await sessionPicker.click()
      await page.getByRole('option', {name: new RegExp(title)}).click()
      await expect(page.getByRole('dialog', {name: 'Session options'})).toBeHidden()
      await page.reload({waitUntil: 'domcontentloaded'})

      await expect(page.getByRole('button', {name: `${title}, session options`})).toBeVisible()
      await expect(page.getByRole('dialog', {name: 'Session options'})).toBeHidden()
      await switchToSessionByTitle(page, title)
    })

    test('a reload right after switching tab or minimizing restores what was on screen', async ({page}) => {
      test.setTimeout(240_000)
      const sessionId = await openPanelOnNewSession(page, suite)
      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      const terminalTab = page.getByRole('tab', {name: 'Terminal'})
      const launcher = page.getByRole('button', {name: 'Open conciv chat'})
      await until(
        async () => {
          const href = await currentHref(suite.kit())
          return href.includes(`/panel/${sessionId}`) && !href.includes('/options')
        },
        {hangGuardMs: 30_000, intervalMs: 100},
      )

      await terminalTab.click()
      await expect(terminalTab).toHaveAttribute('aria-selected', 'true')
      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(panel).toBeVisible()
      await expect(terminalTab).toHaveAttribute('aria-selected', 'true')

      await until(async () => (await currentHref(suite.kit())).includes('/terminal'), {
        hangGuardMs: 30_000,
        intervalMs: 100,
      })
      await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
      await expect(launcher).toBeVisible()
      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(launcher).toBeVisible()
      await expect(panel).toBeHidden()
    })
  })

  test.describe('the draft is kept in this browser first and in the engine second', () => {
    const PIXEL_PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='
    const unsaved = (page: Page) => page.getByRole('status').filter({hasText: 'conciv could not save your draft.'})

    test('text typed and reloaded at once is back in the composer', async ({page}) => {
      await openPanelOnNewSession(page, suite)
      const input = chatBox(page)

      await input.click()
      await input.pressSequentially('typed then reloaded at once')
      await page.reload({waitUntil: 'domcontentloaded'})

      await expect(chatBox(page)).toHaveText('typed then reloaded at once')
    })

    test('text typed and reloaded while another tab holds the draft database is back in the composer', async ({
      page,
    }) => {
      await openPanelOnNewSession(page, suite)
      const otherTab = await page.context().newPage()
      try {
        await otherTab.goto(`${suite.host().base}/conciv-widget.global.js`, {waitUntil: 'domcontentloaded'})
        await otherTab.evaluate(
          () =>
            new Promise<void>((resolve, reject) => {
              const opening = indexedDB.open('conciv-drafts', 1)
              opening.addEventListener('error', () => reject(opening.error))
              opening.addEventListener('success', () => {
                const documents = opening.result.transaction('documents', 'readwrite').objectStore('documents')
                const hold = () => {
                  if (Reflect.get(window, 'releaseDrafts') === true) return
                  documents.count().addEventListener('success', hold)
                }
                hold()
                resolve()
              })
            }),
        )
        const input = chatBox(page)
        await input.click()
        await input.pressSequentially('typed while another tab writes')
        await page.reload({waitUntil: 'domcontentloaded'})
        await otherTab.evaluate(() => Reflect.set(window, 'releaseDrafts', true))

        await expect(chatBox(page)).toHaveText('typed while another tab writes')
      } finally {
        await otherTab.close()
      }
    })

    test('a draft kept only in this browser survives another tab loading before it is trusted', async ({page}) => {
      const KEPT = 'kept here while another tab logs in'
      const context = page.context()
      const refused = await failRpcCalls(page, {path: ['drafts', 'set']})
      const lastRefused = await failRpcCalls(page, {path: ['drafts', 'set'], input: {text: KEPT}})
      const otherEngine = await proxyTo(suite.kit().base)
      try {
        const sessionId = await openPanelOnNewSession(page, suite)
        const input = chatBox(page)
        await input.click()
        await input.pressSequentially(KEPT)
        await lastRefused.answered()
        await page.close()

        const untrusted = await context.newPage()
        await untrusted.goto(`${suite.host().base}/?apiBase=${encodeURIComponent(otherEngine.base)}`, {
          waitUntil: 'domcontentloaded',
        })
        await expect(untrusted.getByRole('button', {name: 'Unauthorized. Authorize conciv'})).toBeVisible()

        const later = await context.newPage()
        await openLoggedIn(later, suite.kit(), suite.host().base)
        await openPanel(later)
        await switchToSessionByTitle(later, `session under test ${sessionId.slice(-12)}`)
        await expect(chatBox(later)).toHaveText(KEPT)
      } finally {
        await lastRefused.dispose()
        await refused.dispose()
        await otherEngine.close()
      }
    })

    test('an image attached through the file chooser, with the engine refusing every draft save, is back after a reload', async ({
      page,
    }) => {
      const refused = await failRpcCalls(page, {path: ['drafts', 'set']})
      try {
        const sessionId = await openPanelOnNewSession(page, suite)
        const chip = page.getByRole('button', {name: 'Remove pixel.png'})

        const chooser = page.waitForEvent('filechooser')
        await page.getByRole('button', {name: 'Add an attachment', exact: true}).click()
        await (
          await chooser
        ).setFiles({name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from(PIXEL_PNG, 'base64')})
        await expect(chip).toBeVisible()
        await refused.answered()
        await page.reload({waitUntil: 'domcontentloaded'})

        await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
        await expect(chip).toBeVisible()
        await expect(chip).toHaveCount(1)
        expect(await suite.kit().rpc.drafts.get({sessionId})).toBeNull()
      } finally {
        await refused.dispose()
      }
    })

    test('a follow-up typed after a send, with the engine refusing its save, is back after a reload', async ({
      page,
    }) => {
      const FOLLOW_UP = 'typed after the send'
      const refused = await failRpcCalls(page, {path: ['drafts', 'set'], input: {text: FOLLOW_UP}})
      try {
        const sessionId = await openPanelOnNewSession(page, suite)
        const input = chatBox(page)
        await input.click()
        await input.pressSequentially('saved, then sent')
        await untilPanelDraft(page, suite.kit(), sessionId, (draft) => draft.text === 'saved, then sent')

        await page.getByRole('button', {name: 'Send message'}).click()
        await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible()
        await expect(input).toHaveText('')
        await input.click()
        await input.pressSequentially(FOLLOW_UP)
        await refused.answered()
        refused.repair()
        await page.reload({waitUntil: 'domcontentloaded'})

        await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
        await untilPanelDraft(page, suite.kit(), sessionId, (draft) => draft.text === FOLLOW_UP)
        await expect(chatBox(page)).toHaveText(FOLLOW_UP)
      } finally {
        await refused.dispose()
      }
    })

    test('a page with no local copy, as in a fresh profile, gets the draft the engine holds', async ({
      page,
      browser,
    }) => {
      const sessionId = await openPanelOnNewSession(page, suite)
      const input = chatBox(page)
      await input.click()
      await input.pressSequentially('held by the engine')
      await untilPanelDraft(page, suite.kit(), sessionId, (draft) => draft.text === 'held by the engine')

      const fresh = await browser.newPage()
      try {
        await openLoggedIn(fresh, suite.kit(), suite.host().base)
        await openPanel(fresh)
        await switchToSessionByTitle(fresh, `session under test ${sessionId.slice(-12)}`)
        await expect(chatBox(fresh)).toHaveText('held by the engine')
      } finally {
        await fresh.close()
      }
    })

    test('with the engine refusing every draft save, text typed and reloaded is back and the unsaved notice shows', async ({
      page,
    }) => {
      const refused = await failRpcCalls(page, {path: ['drafts', 'set']})
      try {
        const sessionId = await openPanelOnNewSession(page, suite)
        const input = chatBox(page)
        await input.click()
        await input.pressSequentially('kept while the engine refuses')
        await page.clock.install()
        await page.reload({waitUntil: 'domcontentloaded'})

        await expect(chatBox(page)).toHaveText('kept while the engine refuses')
        await expect(async () => {
          await page.clock.fastForward(1000)
          await expect(unsaved(page)).toBeVisible({timeout: 1000})
        }).toPass()
        await expect(chatBox(page)).toHaveText('kept while the engine refuses')
        expect(await suite.kit().rpc.drafts.get({sessionId})).toBeNull()
      } finally {
        await refused.dispose()
      }
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
    host = await serveWidgetHost(() => handleHostPage())
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
      const pageErrors = await openHostWithHandle(page, host.base, kit)
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
    host = await serveWidgetHost(() =>
      hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}),
    )
  })

  test.afterEach(async () => {
    await host.close()
    await kit.cleanup()
  })

  async function openWithReply(page: Page): Promise<void> {
    await page.setViewportSize({width: 1400, height: 900})
    await openLoggedIn(page, kit, host.base)
    await openPanel(page)
    await sendMessage(page, 'say something selectable', ASSISTANT_REPLY)
    await page.getByText(ASSISTANT_REPLY).first().hover()
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
        selects: /say something selectable[\s\S]*say something selectable[\s\S]*The widge$/,
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
      await turn.done()
    }
  }

  async function measureSwitch(page: import('@playwright/test').Page, exchanges: number): Promise<{rowCount: number}> {
    const {sessionId} = await suite.kit().rpc.sessions.create()
    const title = `cliff ${exchanges} ${sessionId.slice(-8)}`
    await suite.kit().rpc.sessions.rename({sessionId, title})
    await seedExchanges(sessionId, exchanges)

    await openLoggedIn(page, suite.kit(), suite.host().base)
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
