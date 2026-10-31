import {expect, test as baseTest, describe, it, test} from 'vitest'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {appendDraft, makeDraftStorage} from '../src/pane/draft-storage.js'
import {createSession, seedDraft, proxyTo, type ProxyCore} from './helpers.node.js'
import type {Grab} from '@conciv/grab'
import {resolveGrabSource} from '../src/pane/grab-source-resolve.js'
import {QuickSearchSchema, quickPaneIds, quickSearchFor} from '../src/lib/quick-search.js'
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

    it('leaves the grab alone when symbolication fails', async () => {
      const resolved = await resolveGrabSource(unresolvedGrab(), async () => {
        throw new Error('no widget')
      })
      expect(resolved).toBeNull()
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
    it('disables surfaces on explicit false', () => {
      const settings = parseConcivSettings('{"modal": false, "quickTerminal": false}')
      expect(settings.modal.enabled).toBe(false)
      expect(settings.quickTerminal.enabled).toBe(false)
    })

    it('defaults the launcher to the mascot and reads native or false explicitly', () => {
      expect(parseConcivSettings('{}').launcher).toBe('mascot')
      expect(parseConcivSettings('{"launcher": "mascot"}').launcher).toBe('mascot')
      expect(parseConcivSettings('{"launcher": "native"}').launcher).toBe('native')
      expect(parseConcivSettings('{"launcher": false}').launcher).toBe(false)
      expect(parseConcivSettings('{"launcher": "bogus"}').launcher).toBe('mascot')
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
  })
})
