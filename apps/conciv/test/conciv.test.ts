import {expect, test as baseTest, describe, it, test} from 'vitest'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {appendDraft, makeDraftStorage} from '../src/pane/draft-storage.js'
import {createSession, seedDraft, proxyTo, type ProxyCore, serveStandaloneApp} from './helpers.node.js'
import {expect as expectLocator} from 'playwright/test'
import type {Browser, Page} from 'playwright'
import {test as browserTest} from '@conciv/browser-fixture'
import {watchChatWire, type ChatWireWatch} from '@conciv/extension-testkit/chat-wire'
import {httpRpcRequestUrls} from '@conciv/extension-testkit/rpc-counts'
import type {Grab} from '@conciv/grab'
import {resolveGrabSource} from '../src/pane/grab-source-resolve.js'
import {QuickSearchSchema, quickPaneIds, quickSearchFor} from '../src/lib/quick-search.js'
import {MAX_ATTACHMENT_RAW_BYTES} from '@conciv/protocol/chat-types'
import {WS_RPC_PAYLOAD_BUDGET_BYTES} from '@conciv/protocol/rpc-types'
import {checkSend, MAX_CONTENT_PARTS} from '../src/pane/send-checks.js'
import {parseConcivSettings} from '../src/data/settings.js'
import {foldToolDurations, type ToolPartLike} from '../src/pane/tool-durations.js'

describe('draft storage', () => {
  const DRAFTS_GET_PATH = '/rpc/drafts/get'
  const DRAFTS_SET_PATH = '/rpc/drafts/set'

  type StoredDraft = {sessionId: string; text: string; selectionStart: number; selectionEnd: number}

  const test = baseTest.extend<{kit: CoreKit; core: ProxyCore; sessionId: string}>({
    kit: [
      // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
      async ({}, use) => {
        const kit = await bootCoreKit({id: 'draft-storage'})
        await use(kit)
        await kit.cleanup()
      },
      {scope: 'test'},
    ],
    core: async ({kit}, use) => {
      const core = await proxyTo(kit.base)
      await use(core)
      await core.close()
    },
    sessionId: async ({kit}, use) => {
      await use(await createSession(kit.rpc))
    },
  })

  function composerDraft(text: string): string {
    return JSON.stringify({text, quote: null, attachments: []})
  }

  async function storedDraft(rpc: RpcClient, sessionId: string): Promise<StoredDraft | null> {
    const row = await rpc.drafts.get({sessionId})
    if (!row) return null
    return {
      sessionId: row.sessionId,
      text: row.text,
      selectionStart: row.selectionStart,
      selectionEnd: row.selectionEnd,
    }
  }

  test('seeds the cache from the server draft row in the composer draft shape', async ({kit, core, sessionId}) => {
    await seedDraft(kit.rpc, sessionId, {text: 'kept across the reload'})

    const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    expect(JSON.parse(draftStorage.storage.getItem('any') ?? '')).toEqual({
      text: 'kept across the reload',
      quote: null,
      attachments: [],
    })
  })

  test('starts empty when the server has no draft', async ({core, sessionId}) => {
    const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    expect(draftStorage.storage.getItem('any')).toBeNull()
  })

  test('writes the composer draft back to the server with the caret at the end', async ({kit, core, sessionId}) => {
    const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    draftStorage.storage.setItem('any', composerDraft('a fresh draft'))

    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toEqual({
      sessionId,
      text: 'a fresh draft',
      selectionStart: 13,
      selectionEnd: 13,
    })
  })

  test('collapses a burst of writes into the last draft', async ({kit, core, sessionId}) => {
    const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    draftStorage.storage.setItem('any', composerDraft('a'))
    draftStorage.storage.setItem('any', composerDraft('ab'))
    draftStorage.storage.setItem('any', composerDraft('abc'))

    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toEqual({
      sessionId,
      text: 'abc',
      selectionStart: 3,
      selectionEnd: 3,
    })
    expect(core.requestCount(DRAFTS_SET_PATH)).toBe(1)
  })

  test('keeps the latest value readable even when the payload cannot be persisted', async ({kit, core, sessionId}) => {
    const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    draftStorage.storage.setItem('any', 'not json at all')
    expect(draftStorage.storage.getItem('any')).toBe('not json at all')

    draftStorage.storage.setItem('any', composerDraft('a draft that parses'))

    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toEqual({
      sessionId,
      text: 'a draft that parses',
      selectionStart: 19,
      selectionEnd: 19,
    })
    expect(core.requestCount(DRAFTS_SET_PATH)).toBe(1)
  })

  test('persists the noted caret offsets with the draft text', async ({kit, core, sessionId}) => {
    const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    draftStorage.storage.setItem('any', composerDraft('say hello!'))
    draftStorage.noteSelection({start: 4, end: 4})

    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toEqual({
      sessionId,
      text: 'say hello!',
      selectionStart: 4,
      selectionEnd: 4,
    })
  })

  test('clamps noted offsets that fall beyond the persisted text', async ({kit, core, sessionId}) => {
    const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    draftStorage.noteSelection({start: 40, end: 44})
    draftStorage.storage.setItem('any', composerDraft('short'))

    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toEqual({
      sessionId,
      text: 'short',
      selectionStart: 5,
      selectionEnd: 5,
    })
  })

  test('appends to the stored draft on a new line with the caret at the end', async ({kit, core, sessionId}) => {
    await seedDraft(kit.rpc, sessionId, {text: 'a first line'})

    await appendDraft(makeRpcClient(core.base), sessionId, 'a second line')

    expect(await storedDraft(kit.rpc, sessionId)).toEqual({
      sessionId,
      text: 'a first line\na second line',
      selectionStart: 26,
      selectionEnd: 26,
    })
  })

  const PERSISTED = {
    id: 'a1',
    type: 'document',
    name: 'Grabbed element',
    contentType: 'application/vnd.conciv.grab+json',
    data: 'eyJ4IjoxfQ==',
  }

  test('an attachment written to the draft comes back on the next mount', async ({kit, core, sessionId}) => {
    const first = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    first.storage.setItem(sessionId, JSON.stringify({text: 'look at this', quote: null, attachments: [PERSISTED]}))
    await core.awaitRequest(DRAFTS_SET_PATH)

    expect((await kit.rpc.drafts.get({sessionId}))?.attachments).toEqual([PERSISTED])

    const second = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    expect(JSON.parse(second.storage.getItem(sessionId) ?? '{}')).toMatchObject({attachments: [{id: 'a1'}]})
  })

  test('survives a failed initial read and still accepts writes', async ({kit, core, sessionId}) => {
    await seedDraft(kit.rpc, sessionId, {text: 'unreachable at boot'})
    core.fail(DRAFTS_GET_PATH)

    const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

    expect(draftStorage.storage.getItem('any')).toBeNull()

    core.repair()
    draftStorage.storage.setItem('any', composerDraft('after the outage'))

    expect(draftStorage.storage.getItem('any')).toContain('after the outage')
    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toEqual({
      sessionId,
      text: 'after the outage',
      selectionStart: 16,
      selectionEnd: 16,
    })
  })
})

describe('grab source resolve', () => {
  function unresolvedGrab(): Grab {
    return {
      text: '<Kx> in chunk-QWERTY.js',
      snippet: '<button id="try-cta">Try it live</button>',
      frames: [{fileName: 'https://example.test/chunk-QWERTY.js', line: 2, column: 11}],
      preview: {kind: 'image', dataUrl: 'data:image/png;base64,AA==', width: 10, height: 10},
      source: null,
      rect: null,
    }
  }

  describe('resolveGrabSource', () => {
    it('replaces the fallback text and source with the symbolicated location', async () => {
      const resolved = await resolveGrabSource(unresolvedGrab(), async () => ({
        file: 'src/components/landing/hero.tsx',
        line: 42,
        column: 5,
      }))
      expect(resolved?.text).toBe('<button id="try-cta">Try it live</button> at src/components/landing/hero.tsx:42:5')
      expect(resolved?.source).toEqual({
        componentName: null,
        filePath: 'src/components/landing/hero.tsx',
        lineNumber: 42,
      })
    })

    it('leaves the grab alone when symbolication finds nothing', async () => {
      expect(await resolveGrabSource(unresolvedGrab(), async () => null)).toBeNull()
    })

    it('leaves the grab alone when symbolication fails', async () => {
      const resolved = await resolveGrabSource(unresolvedGrab(), async () => {
        throw new Error('no widget')
      })
      expect(resolved).toBeNull()
    })

    it('does not call the server for a grab that already has a source', async () => {
      const calls: number[] = []
      const grab: Grab = {...unresolvedGrab(), source: {componentName: null, filePath: 'src/a.tsx', lineNumber: 1}}
      const resolved = await resolveGrabSource(grab, async () => {
        calls.push(1)
        return {file: 'src/b.tsx', line: 2, column: 0}
      })
      expect(resolved).toBeNull()
      expect(calls).toEqual([])
    })

    it('does not call the server for a grab with no frames', async () => {
      const calls: number[] = []
      const grab: Grab = {...unresolvedGrab(), frames: []}
      const resolved = await resolveGrabSource(grab, async () => {
        calls.push(1)
        return {file: 'src/b.tsx', line: 2, column: 0}
      })
      expect(resolved).toBeNull()
      expect(calls).toEqual([])
    })
  })
})

describe('quick search', () => {
  describe('quick search params', () => {
    it('round-trips pane ids and focus through the schema', () => {
      const search = quickSearchFor(['conciv_a1', 'conciv_b2'], 1)
      const parsed = QuickSearchSchema.parse(search)
      expect(parsed).toEqual({panes: 'conciv_a1,conciv_b2', focus: 1})
      expect(quickPaneIds(parsed)).toEqual(['conciv_a1', 'conciv_b2'])
    })

    it('drops non-session ids from panes', () => {
      const parsed = QuickSearchSchema.parse({panes: 'conciv_ok,,nope,conciv_2', focus: 0})
      expect(quickPaneIds(parsed)).toEqual(['conciv_ok', 'conciv_2'])
    })

    it('falls back to empty panes and focus 0 on invalid values', () => {
      expect(QuickSearchSchema.parse({})).toEqual({panes: '', focus: 0})
      expect(QuickSearchSchema.parse({panes: 42, focus: 'x'})).toEqual({panes: '', focus: 0})
      expect(QuickSearchSchema.parse({panes: 'conciv_a', focus: -3})).toEqual({panes: 'conciv_a', focus: 0})
    })

    it('empty pane list serializes to an empty panes string', () => {
      expect(quickSearchFor([], 0)).toEqual({panes: '', focus: 0})
      expect(quickPaneIds({panes: '', focus: 0})).toEqual([])
    })
  })
})

describe('send checks', () => {
  const ready = {busy: false, reachable: true}

  function parts(count: number): {content: {type: 'text'; content: string}[]} {
    return {content: Array.from({length: count}, () => ({type: 'text', content: 'x'}))}
  }

  test('lets a message with something in it through', () => {
    expect(checkSend('rename the widget package', ready)).toEqual({ok: true})
    expect(checkSend(parts(2), ready)).toEqual({ok: true})
  })

  test('turns an empty message down without saying anything', () => {
    expect(checkSend('   ', ready)).toEqual({ok: false, message: null, tone: 'info'})
    expect(checkSend({content: []}, ready)).toEqual({ok: false, message: null, tone: 'info'})
  })

  test('turns a send down while the conversation is being compressed', () => {
    expect(checkSend('rename the widget package', {busy: true, reachable: true}).ok).toBe(false)
  })

  test('says why it turned down too many attachments instead of dropping them', () => {
    const verdict = checkSend(parts(MAX_CONTENT_PARTS + 1), ready)
    expect(verdict).toEqual({
      ok: false,
      message: 'Too many attachments. Remove some and send again.',
      tone: 'warn',
    })
  })

  test('turns down a message whose payload would blow the ws frame limit', () => {
    const oversized = {
      content: [
        {type: 'text', content: 'look at this'},
        {type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'A'.repeat(WS_RPC_PAYLOAD_BUDGET_BYTES)}},
      ],
    }
    const verdict = checkSend(oversized, ready)
    expect(verdict).toEqual({
      ok: false,
      message: 'Message too large to send. Remove an attachment or shorten it.',
      tone: 'warn',
    })
  })

  test('lets a message with a budget-sized attachment through', () => {
    const largestBase64Length = Math.ceil(MAX_ATTACHMENT_RAW_BYTES / 3) * 4
    const withinBudget = {
      content: [{type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'A'.repeat(largestBase64Length)}}],
    }
    expect(checkSend(withinBudget, ready)).toEqual({ok: true})
  })

  test('says the engine is unreachable instead of swallowing the message', () => {
    const verdict = checkSend('rename the widget package', {busy: false, reachable: false})
    expect(verdict).toEqual({
      ok: false,
      message: 'conciv lost connection to the engine. Your message is still in the composer.',
      tone: 'warn',
    })
  })
})

describe('settings', () => {
  describe('parseConcivSettings', () => {
    it('reads the dock surface and falls back to the page surface', () => {
      expect(parseConcivSettings(JSON.stringify({surface: 'dock'})).surface).toBe('dock')
      expect(parseConcivSettings(JSON.stringify({surface: 'nope'})).surface).toBe('page')
    })

    it('returns defaults for empty or invalid raw config', () => {
      const expected = {
        modal: {enabled: true, position: 'bottom-right'},
        quickTerminal: {enabled: true, hotkeys: ['Mod+`']},
        defaultOpen: false,
        launcher: 'mascot',
        surface: 'page',
        transport: 'auto',
      }
      expect(parseConcivSettings('')).toEqual(expected)
      expect(parseConcivSettings('{nope')).toEqual(expected)
      expect(parseConcivSettings('[1,2]')).toEqual(expected)
    })

    it('disables surfaces on explicit false', () => {
      const settings = parseConcivSettings('{"modal": false, "quickTerminal": false}')
      expect(settings.modal.enabled).toBe(false)
      expect(settings.quickTerminal.enabled).toBe(false)
    })

    it('reads modal position and validates unknown values back to the default', () => {
      expect(parseConcivSettings('{"modal": {"position": "top-left"}}').modal.position).toBe('top-left')
      expect(parseConcivSettings('{"modal": {"position": "under-the-sea"}}').modal.position).toBe('bottom-right')
    })

    it('defaults the launcher to the mascot and reads native or false explicitly', () => {
      expect(parseConcivSettings('{}').launcher).toBe('mascot')
      expect(parseConcivSettings('{"launcher": "mascot"}').launcher).toBe('mascot')
      expect(parseConcivSettings('{"launcher": "native"}').launcher).toBe('native')
      expect(parseConcivSettings('{"launcher": false}').launcher).toBe(false)
      expect(parseConcivSettings('{"launcher": "bogus"}').launcher).toBe('mascot')
    })

    it('defaultOpen only on explicit true', () => {
      expect(parseConcivSettings('{"defaultOpen": true}').defaultOpen).toBe(true)
      expect(parseConcivSettings('{"defaultOpen": "yes"}').defaultOpen).toBe(false)
      expect(parseConcivSettings('{}').defaultOpen).toBe(false)
    })

    it('accepts hotkey as string or array', () => {
      expect(parseConcivSettings('{"quickTerminal": {"hotkey": "Mod+k"}}').quickTerminal.hotkeys).toEqual(['Mod+k'])
      expect(parseConcivSettings('{"quickTerminal": {"hotkey": ["Mod+k", "Mod+j"]}}').quickTerminal.hotkeys).toEqual([
        'Mod+k',
        'Mod+j',
      ])
    })
  })
})

describe('tool durations', () => {
  const message = (...parts: ToolPartLike[]): {parts: ToolPartLike[]} => ({parts})

  function makeClock(start: number): {now: () => number; advance: (ms: number) => void} {
    const state = {at: start}
    return {
      now: () => state.at,
      advance: (ms) => {
        state.at += ms
      },
    }
  }

  describe('foldToolDurations', () => {
    it('measures from first pending sighting to the settling fold', () => {
      const startedAt = new Map<string, number>()
      const clock = makeClock(1_000)
      const pending = foldToolDurations(
        [message({type: 'tool-call', id: 'a', state: 'input-streaming'})],
        startedAt,
        clock.now,
        {},
      )
      expect(pending).toEqual({})
      clock.advance(250)
      const settled = foldToolDurations(
        [message({type: 'tool-call', id: 'a', state: 'complete'})],
        startedAt,
        clock.now,
        pending,
      )
      expect(settled).toEqual({a: 250})
    })

    it('treats error state and present output as settled', () => {
      const startedAt = new Map<string, number>()
      const clock = makeClock(0)
      foldToolDurations(
        [message({type: 'tool-call', id: 'err', state: 'pending'}, {type: 'tool-call', id: 'out', state: 'pending'})],
        startedAt,
        clock.now,
        {},
      )
      clock.advance(40)
      const next = foldToolDurations(
        [
          message(
            {type: 'tool-call', id: 'err', state: 'error'},
            {type: 'tool-call', id: 'out', state: 'pending', output: {ok: true}},
          ),
        ],
        startedAt,
        clock.now,
        {},
      )
      expect(next).toEqual({err: 40, out: 40})
    })

    it('never rewrites a recorded duration on later folds', () => {
      const startedAt = new Map<string, number>()
      const clock = makeClock(0)
      foldToolDurations([message({type: 'tool-call', id: 'a', state: 'pending'})], startedAt, clock.now, {})
      clock.advance(10)
      const first = foldToolDurations(
        [message({type: 'tool-call', id: 'a', state: 'complete'})],
        startedAt,
        clock.now,
        {},
      )
      clock.advance(500)
      const second = foldToolDurations(
        [message({type: 'tool-call', id: 'a', state: 'complete'})],
        startedAt,
        clock.now,
        first,
      )
      expect(second).toEqual({a: 10})
    })

    it('records nothing for a part that was already settled at first sight', () => {
      const startedAt = new Map<string, number>()
      const clock = makeClock(0)
      const next = foldToolDurations(
        [message({type: 'tool-call', id: 'a', state: 'complete'})],
        startedAt,
        clock.now,
        {},
      )
      expect(next).toEqual({})
    })

    it('ignores non-tool parts and tool calls without ids', () => {
      const startedAt = new Map<string, number>()
      const clock = makeClock(0)
      const next = foldToolDurations(
        [
          message(
            {type: 'text'},
            {type: 'tool-call', id: '', state: 'complete'},
            {type: 'tool-call', state: 'complete'},
          ),
        ],
        startedAt,
        clock.now,
        {},
      )
      expect(next).toEqual({})
      expect(startedAt.size).toBe(0)
    })
  })
})

describe('transport standalone', () => {
  const ASSISTANT_TEXT = 'Hello from standalone conciv'
  const MOUNT_TIMEOUT_MS = 30_000
  const SUITE_SETUP_TIMEOUT_MS = 90_000

  const test = browserTest.extend<{kit: CoreKit; openCore: ProxyCore; app: {base: string; close: () => Promise<void>}}>(
    {
      kit: [
        // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
        async ({}, use) => {
          const kit = await bootCoreKit({id: 'standalone-transport', text: ASSISTANT_TEXT})
          await use(kit)
          await kit.cleanup()
        },
        {scope: 'test'},
      ],
      openCore: [
        async ({kit}, use) => {
          const openCore = await proxyTo(kit.base)
          await use(openCore)
          await openCore.close()
        },
        {scope: 'test'},
      ],
      app: [
        // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
        async ({}, use) => {
          const app = await serveStandaloneApp()
          await use(app)
          await app.close()
        },
        {scope: 'test'},
      ],
    },
  )

  function pageUrl(appBase: string, coreBase: string, transport: 'websocket' | 'fetch'): string {
    const settings = encodeURIComponent(JSON.stringify({transport}))
    return `${appBase}/?core=${encodeURIComponent(coreBase)}&settings=${settings}`
  }

  type Tab = {
    page: Page
    chat: ChatWireWatch
    chatSocketMark: number
    httpRpcUrls: string[]
    disposeHttpRpc: () => void
  }

  async function openTab(browser: Browser, url: string): Promise<Tab> {
    const page = await browser.newPage()
    const http = httpRpcRequestUrls(page)
    const chat = watchChatWire(page)
    const chatSocketMark = chat.socketMark()
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    return {page, chat, chatSocketMark, httpRpcUrls: http.urls, disposeHttpRpc: http.dispose}
  }

  async function completeTurn(page: Page): Promise<void> {
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('hi there')
    await page.keyboard.press('Enter')
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  }

  test.describe('the standalone entry threads settings.transport into the chat connection', () => {
    test(
      'pins the event stream and never opens a chat websocket when settings say transport: fetch',
      async ({browser, app, openCore}) => {
        const tab = await openTab(browser, pageUrl(app.base, openCore.base, 'fetch'))
        try {
          const sent = tab.chat.nextTurn()
          await completeTurn(tab.page)
          expect((await sent).transport).toBe('fetch')
          expect(tab.chat.socketsOpenedSince(tab.chatSocketMark)).toBe(0)
          expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
        } finally {
          tab.disposeHttpRpc()
          await tab.page.close()
        }
      },
      SUITE_SETUP_TIMEOUT_MS,
    )

    test(
      'pins the chat websocket and never falls back to the event stream when settings say transport: websocket',
      async ({browser, app, openCore}) => {
        const tab = await openTab(browser, pageUrl(app.base, openCore.base, 'websocket'))
        try {
          const sent = tab.chat.nextTurn()
          await completeTurn(tab.page)
          expect((await sent).transport).toBe('websocket')
          expect(tab.chat.socketsOpenedSince(tab.chatSocketMark)).toBe(1)
          expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
        } finally {
          tab.disposeHttpRpc()
          await tab.page.close()
        }
      },
      SUITE_SETUP_TIMEOUT_MS,
    )
  })
})
