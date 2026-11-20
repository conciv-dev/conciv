import {expect, expectTypeOf, test as baseTest, describe, it, test, vi} from 'vitest'
import {Plugin, type SetupContext} from '@conciv/plugin/experimental'
import {defineInternalPlugin, isInternalPlugin} from '@conciv/plugin-internal'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'
import {
  appendDraft,
  makeDraftStorage,
  makeDraftWriteChain,
  reconcileDraft,
  type RestoredDraft,
} from '../src/pane/draft-storage.js'
import {QueryClient} from '@conciv/client'
import {makeAppData, type AppData} from '../src/data/app-data.js'
import {createSession, seedDraft, proxyTo, type ProxyCore} from './helpers.node.js'
import type {Grab} from '@conciv/grab'
import {resolveGrabSource} from '../src/pane/grab-source-resolve.js'
import {QuickSearchSchema, quickPaneIds, quickSearchFor} from '../src/lib/quick-search.js'
import {WS_RPC_PAYLOAD_BUDGET_BYTES} from '@conciv/protocol/rpc-types'
import {checkSend, MAX_CONTENT_PARTS} from '../src/pane/send-checks.js'
import {mergeToolMeta} from '../src/pane/tool-catalog-meta.js'
import {tanstackToolMeta} from '@conciv/plugin-tanstack/client'
import {rankSessionTitle} from '../src/pane/session-title-rank.js'
import {parseConcivSettings} from '../src/data/settings.js'
import {contextItemKey, durableNote} from '../src/composer/note-schema.js'
import {formatNoteComment, noteComment, promptWithNotes, readPromptPresentation} from '../src/composer/comment-note.js'
import {
  clamp,
  cornerAt,
  cornerCoords,
  directionCorner,
  offScreenEdge,
  parsePlacement,
  presetPlacement,
  quadrantCorner,
  stepAxis,
  throwPath,
  toPercent,
  toPixels,
} from '../src/lib/draggable-physics.js'

describe('draft storage', () => {
  const DRAFTS_GET_PATH = '/rpc/drafts/get'
  const DRAFTS_SET_PATH = '/rpc/drafts/set'

  type StoredDraft = {sessionId: string; text: string; selectionStart: number; selectionEnd: number}

  const test = baseTest.extend<{kit: CoreKit; core: ProxyCore; app: AppData; sessionId: string}>({
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
    app: async ({core}, use) => {
      const app = makeAppData(
        makeRpcClient(core.base),
        new QueryClient(),
        null,
        () => false,
        () => core.base,
      )
      await use(app)
      app.dispose()
    },
    sessionId: async ({kit}, use) => {
      await use(await createSession(kit.rpc))
    },
  })

  function draftApp(base: string): AppData {
    return makeAppData(
      makeRpcClient(base),
      new QueryClient(),
      null,
      () => false,
      () => base,
    )
  }

  type ComposerItem = {key: string; value: unknown}

  function composerDraft(text: string, items: ComposerItem[] = []): string {
    return JSON.stringify({text, quote: null, attachments: [], items})
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

  test('clamps noted offsets that fall beyond the persisted text', async ({kit, core, sessionId, app}) => {
    const draftStorage = makeDraftStorage(app, makeDraftWriteChain(), sessionId)
    await draftStorage.restore(() => {}, new AbortController().signal)

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

  test('a composer cleared before the server draft arrives clears the server draft', async ({
    kit,
    core,
    sessionId,
    app,
  }) => {
    await seedDraft(kit.rpc, sessionId, {text: 'stale on the server'})
    const draftStorage = makeDraftStorage(app, makeDraftWriteChain(), sessionId)

    draftStorage.storage.setItem('any', composerDraft('typed early'))
    draftStorage.storage.setItem('any', composerDraft(''))
    const restored: RestoredDraft[] = []
    await draftStorage.restore((draft) => restored.push(draft), new AbortController().signal)
    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(restored).toEqual([])
    expect(await storedDraft(kit.rpc, sessionId)).toMatchObject({text: ''})
  })

  test('clearing a restored draft before its first write reaches the server', async ({kit, core, sessionId, app}) => {
    await seedDraft(kit.rpc, sessionId, {text: 'restored then cleared'})
    const draftStorage = makeDraftStorage(app, makeDraftWriteChain(), sessionId)
    await draftStorage.restore(() => {}, new AbortController().signal)

    draftStorage.storage.setItem('any', composerDraft(''))
    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toMatchObject({text: ''})
  })

  test('the latest text typed before the server draft arrives is written once it has', async ({
    kit,
    core,
    sessionId,
    app,
  }) => {
    const draftStorage = makeDraftStorage(app, makeDraftWriteChain(), sessionId)

    draftStorage.storage.setItem('any', composerDraft('typed while loading'))
    await draftStorage.restore(() => {}, new AbortController().signal)
    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toMatchObject({text: 'typed while loading'})
  })

  test('appends to the stored draft on a new line with the caret at the end', async ({kit, sessionId, app}) => {
    await seedDraft(kit.rpc, sessionId, {text: 'a first line'})

    await (
      await appendDraft(app, makeDraftWriteChain(), sessionId, 'a second line')
    ).saving

    expect(await storedDraft(kit.rpc, sessionId)).toEqual({
      sessionId,
      text: 'a first line\na second line',
      selectionStart: 26,
      selectionEnd: 26,
    })
  })

  test('two kept drafts written at once both stay, in the order they were kept', async ({kit, core, sessionId}) => {
    const appData = draftApp(core.base)
    const keep = makeDraftWriteChain()
    const note = {key: 'note:fixture:c=1', value: {comment: 'kept with the second line'}}

    await Promise.all([
      appendDraft(appData, keep, sessionId, 'a first line').then((kept) => kept.saving),
      appendDraft(appData, keep, sessionId, 'a second line', [note]).then((kept) => kept.saving),
    ])

    expect(await kit.rpc.drafts.get({sessionId})).toMatchObject({
      text: 'a first line\na second line',
      items: [note],
    })
  })

  test('the composer items reach the server draft, outlive an appended line and come back on a reload', async ({
    kit,
    core,
    sessionId,
  }) => {
    const staged = [{key: 'note:grab:c=1', value: {comment: 'make it blue', nested: {tags: ['a'], done: false}}}]
    const updated = [
      {key: 'note:grab:c=1', value: {comment: 'make it red'}},
      {key: 'toString', value: {comment: 'an item whose key an object inherits'}},
    ]
    const draftStorage = makeDraftStorage(draftApp(core.base), makeDraftWriteChain(), sessionId)
    await draftStorage.restore(() => {}, new AbortController().signal)

    draftStorage.storage.setItem('any', composerDraft('a noted draft', staged))
    await core.awaitRequest(DRAFTS_SET_PATH)
    expect(await kit.rpc.drafts.get({sessionId})).toMatchObject({text: 'a noted draft', items: staged})

    draftStorage.storage.setItem('any', composerDraft('', staged))
    await core.awaitRequest(DRAFTS_SET_PATH)
    draftStorage.storage.setItem('any', composerDraft('', updated))
    await core.awaitRequest(DRAFTS_SET_PATH)
    expect(await kit.rpc.drafts.get({sessionId})).toMatchObject({text: '', items: updated})

    await (
      await appendDraft(draftApp(core.base), makeDraftWriteChain(), sessionId, 'a queued line')
    ).saving
    expect(await kit.rpc.drafts.get({sessionId})).toMatchObject({text: 'a queued line', items: updated})

    const restored: RestoredDraft[] = []
    await makeDraftStorage(draftApp(core.base), makeDraftWriteChain(), sessionId).restore(
      (draft) => restored.push(draft),
      new AbortController().signal,
    )
    expect(restored.map((draft) => JSON.parse(draft.snapshot.getItem('any') ?? 'null'))).toEqual([
      {text: 'a queued line', quote: null, attachments: [], items: updated},
    ])
  })

  test('a staged note read back from the server draft drops its live part', async ({kit, core, sessionId}) => {
    const note = {
      type: 'note',
      origin: 'fixture',
      commentId: 'c1',
      label: 'Fixture note',
      icon: 'terminal',
      subject: 'the fixture subject',
      live: {subject: 'the live subject'},
      comment: 'make it blue',
    }
    const other = {key: 'file:a', value: {live: 'kept'}}
    await kit.rpc.drafts.set({
      sessionId,
      text: 'noted',
      selectionStart: 5,
      selectionEnd: 5,
      attachments: [],
      items: [{key: 'note:fixture:c=c1', value: note}, other],
      updatedAt: Date.now(),
    })

    const restored: RestoredDraft[] = []
    await makeDraftStorage(draftApp(core.base), makeDraftWriteChain(), sessionId).restore(
      (draft) => restored.push(draft),
      new AbortController().signal,
    )

    expect(restored.map((draft) => JSON.parse(draft.snapshot.getItem('any') ?? 'null').items)).toEqual([
      [{key: 'note:fixture:c=c1', value: {...note, live: undefined}}, other],
    ])
  })

  test('survives a failed initial read and still accepts writes', async ({kit, core, sessionId, app}) => {
    await seedDraft(kit.rpc, sessionId, {text: 'unreachable at boot'})
    core.fail(DRAFTS_GET_PATH)

    const draftStorage = makeDraftStorage(app, makeDraftWriteChain(), sessionId)
    const restored: RestoredDraft[] = []
    await draftStorage.restore((draft) => restored.push(draft), new AbortController().signal)

    expect(restored).toEqual([])
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

  describe('a query reset', () => {
    test('a draft read the reset cancels is not logged as a failure', async ({kit, core, sessionId}) => {
      await seedDraft(kit.rpc, sessionId, {text: 'kept through the rebind'})
      const queryClient = new QueryClient()
      const app = makeAppData(
        makeRpcClient(core.base),
        queryClient,
        null,
        () => false,
        () => core.base,
      )
      const errors = vi.spyOn(console, 'error')
      const draftStorage = makeDraftStorage(app, makeDraftWriteChain(), sessionId)

      const restoring = draftStorage.restore(() => {}, new AbortController().signal)
      await queryClient.resetQueries()
      await restoring

      const logged = [...errors.mock.calls]
      errors.mockRestore()
      app.dispose()

      expect(logged).toEqual([])
    })
  })

  describe('an engine that does not trust this browser', () => {
    test('a refused draft save stays unsaved and is not logged as a failure', async ({kit, sessionId}) => {
      const app = makeAppData(
        makeRpcClient(kit.origin),
        new QueryClient(),
        null,
        () => false,
        () => kit.origin,
      )
      const errors = vi.spyOn(console, 'error')

      const saved = await app.saveDraft({
        sessionId,
        text: 'typed while untrusted',
        selectionStart: 0,
        selectionEnd: 0,
        attachments: [],
        items: [],
        updatedAt: Date.now(),
      })

      const logged = [...errors.mock.calls]
      errors.mockRestore()
      app.dispose()

      expect(saved).toBe(false)
      expect(logged).toEqual([])
      expect(await storedDraft(kit.rpc, sessionId)).toBeNull()
    })
  })
})

describe('composer notes', () => {
  const item = {
    type: 'note' as const,
    origin: 'fixture',
    commentId: 'c1',
    label: 'Fixture note',
    icon: 'terminal',
    subject: 'the fixture subject',
    comment: ' make it blue ',
  }

  test('a note is keyed, sent, read and worded as the source', () => {
    expect(contextItemKey(item)).toBe('note:fixture:c=c1')

    const sent = noteComment(item, 'make it blue')
    expect(sent).toEqual({
      type: 'note',
      origin: 'fixture',
      label: 'Fixture note',
      icon: 'terminal',
      subject: 'the fixture subject',
      comment: 'make it blue',
    })
    const full = noteComment(
      {...item, title: 'A title', subtitle: 'A subtitle', href: '', live: {subject: 'the live subject'}},
      '',
    )
    expect(full).toEqual({
      ...sent,
      title: 'A title',
      subtitle: 'A subtitle',
      live: {subject: 'the live subject'},
      comment: '',
    })
    expect(durableNote(full)).toEqual({...sent, title: 'A title', subtitle: 'A subtitle', comment: ''})

    expect(formatNoteComment(sent)).toBe(
      'The user made the following comment regarding the fixture subject: make it blue',
    )
    expect(formatNoteComment({...sent, comment: '  '})).toBe('The user referenced the fixture subject.')
    expect(formatNoteComment(full)).toBe('The user referenced the live subject.')

    expect(readPromptPresentation({displayText: 'typed'})).toBeUndefined()
    expect(readPromptPresentation(undefined)).toBeUndefined()
    expect(
      readPromptPresentation({
        displayText: 'typed',
        comments: [sent, {type: 'note', origin: 'fixture'}, 'not a note'],
        attachments: [{name: 'a.txt', mime: 'text/plain', path: '/workspace/a.txt'}, {name: 'broken'}],
        conciv: {kept: true},
      }),
    ).toEqual({
      displayText: 'typed',
      comments: [sent],
      attachments: [{name: 'a.txt', mime: 'text/plain', path: '/workspace/a.txt'}],
    })
    expect(readPromptPresentation({displayText: '', comments: []})).toEqual({
      displayText: '',
      comments: [],
      attachments: [],
    })
  })

  test('a string the composer hands over is the text sent and shown, not the draft it came from', () => {
    const draft = {
      draft: 'the draft as typed',
      attachments: [],
      quote: null,
      items: [{key: contextItemKey(item), value: item}],
    }

    expect(promptWithNotes('the content handed over', draft)).toEqual({
      content: [
        'the content handed over',
        'The user made the following comment regarding the fixture subject: make it blue',
      ].join('\n'),
      metadata: {
        displayText: 'the content handed over',
        comments: [noteComment(item, 'make it blue')],
        attachments: [],
      },
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
  const ready = {busy: false, reachable: true, locked: null}

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
    expect(checkSend('rename the widget package', {busy: true, reachable: true, locked: null}).ok).toBe(false)
  })

  test('says why it turned down too many attachments instead of dropping them', () => {
    const verdict = checkSend(parts(MAX_CONTENT_PARTS + 1), ready)
    expect(verdict).toEqual({
      ok: false,
      message: 'Too many attachments. Remove some and send again.',
      tone: 'warn',
    })

    const note = {
      type: 'note' as const,
      origin: 'fixture',
      commentId: 'c1',
      label: 'Fixture note',
      icon: 'terminal',
      subject: 'the fixture subject',
      comment: 'make it blue',
    }
    const image = {type: 'image' as const, source: {type: 'data' as const, mimeType: 'image/png', value: 'AA=='}}
    const withNote = (attachments: number) =>
      promptWithNotes(
        {content: [{type: 'text', content: 'typed'}, ...Array.from({length: attachments}, () => image)]},
        {draft: 'typed', attachments: [], quote: null, items: [{key: contextItemKey(note), value: note}]},
      )
    expect(checkSend(withNote(MAX_CONTENT_PARTS - 1), ready)).toEqual({ok: true})
    expect(checkSend(withNote(MAX_CONTENT_PARTS), ready)).toEqual(verdict)
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
    const verdict = checkSend('rename the widget package', {busy: false, reachable: false, locked: null})
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

describe('launcher drag physics', () => {
  describe('throw physics', () => {
    it('clamps values into range', () => {
      expect(clamp(5, 0, 10)).toBe(5)
      expect(clamp(-5, 0, 10)).toBe(0)
      expect(clamp(50, 0, 10)).toBe(10)
      expect(clamp(5, 10, 0)).toBe(10)
    })

    it('advances position by velocity while inside the walls', () => {
      const {position, velocity} = stepAxis(100, 10, 0, 500)
      expect(position).toBe(110)
      expect(velocity).toBeCloseTo(9.5)
    })

    it('bounces and damps velocity at a wall', () => {
      const hitMax = stepAxis(495, 20, 0, 500)
      expect(hitMax.position).toBe(500)
      expect(hitMax.velocity).toBeCloseTo(-9.5)

      const hitMin = stepAxis(5, -20, 0, 500)
      expect(hitMin.position).toBe(0)
      expect(hitMin.velocity).toBeGreaterThan(0)
    })

    it('a throw decays to a stop inside the walls, bouncing off the one it hits', () => {
      const bounds = {minX: 0, minY: 0, maxX: 500, maxY: 300}
      const path = throwPath({x: 250, y: 150}, {x: 40, y: 0}, bounds)
      const end = path.at(-1)
      expect(path.length).toBeGreaterThan(10)
      expect(path.length).toBeLessThan(600)
      expect(path.some((frame) => frame.x === 500)).toBe(true)
      expect(end?.x).toBeGreaterThanOrEqual(0)
      expect(end?.x).toBeLessThan(500)
      expect(end?.y).toBe(150)
    })

    it('a release with no speed left has no throw', () => {
      expect(throwPath({x: 10, y: 10}, {x: 0.05, y: 0.05}, {minX: 0, minY: 0, maxX: 500, maxY: 300})).toEqual([])
    })
  })

  describe('hot corners', () => {
    const bounds = {minX: 8, minY: 8, maxX: 508, maxY: 308}

    it('goes hot only when both axes are near a wall', () => {
      expect(cornerAt({x: 10, y: 10}, bounds, 72)).toBe('top-left')
      expect(cornerAt({x: 500, y: 300}, bounds, 72)).toBe('bottom-right')
      expect(cornerAt({x: 10, y: 300}, bounds, 72)).toBe('bottom-left')
      expect(cornerAt({x: 500, y: 10}, bounds, 72)).toBe('top-right')
      expect(cornerAt({x: 10, y: 160}, bounds, 72)).toBeNull()
      expect(cornerAt({x: 250, y: 10}, bounds, 72)).toBeNull()
      expect(cornerAt({x: 250, y: 160}, bounds, 72)).toBeNull()
    })

    it('treats the snap distance as inclusive', () => {
      expect(cornerAt({x: 80, y: 80}, bounds, 72)).toBe('top-left')
      expect(cornerAt({x: 81, y: 81}, bounds, 72)).toBeNull()
    })

    it('anchors a pinned corner to the padded bounds', () => {
      expect(cornerCoords('top-left', bounds)).toEqual({x: 8, y: 8})
      expect(cornerCoords('top-right', bounds)).toEqual({x: 508, y: 8})
      expect(cornerCoords('bottom-left', bounds)).toEqual({x: 8, y: 308})
      expect(cornerCoords('bottom-right', bounds)).toEqual({x: 508, y: 308})
    })

    it('keeps a pin on screen when the window is smaller than the launcher', () => {
      expect(cornerCoords('bottom-right', {minX: 8, minY: 8, maxX: -20, maxY: -20})).toEqual({x: 8, y: 8})
    })
  })

  describe('magnetic direction', () => {
    it('reads a corner from the direction of a nudge alone', () => {
      expect(directionCorner(-40, -40, null)).toBe('top-left')
      expect(directionCorner(40, -40, null)).toBe('top-right')
      expect(directionCorner(-40, 40, null)).toBe('bottom-left')
      expect(directionCorner(40, 40, null)).toBe('bottom-right')
    })

    it('keeps the fallback when neither axis leaves the deadzone', () => {
      expect(directionCorner(4, -4, 'bottom-left')).toBe('bottom-left')
      expect(directionCorner(0, 0, null)).toBeNull()
    })

    it('ignores sideways wander on a long drag along one axis', () => {
      expect(directionCorner(12, -200, 'bottom-left')).toBe('top-left')
      expect(directionCorner(-12, -200, 'bottom-right')).toBe('top-right')
      expect(directionCorner(200, 12, 'top-right')).toBe('top-right')
      expect(directionCorner(200, -12, 'bottom-left')).toBe('bottom-right')
    })

    it('still reads a diagonal once the minor axis is deliberate', () => {
      expect(directionCorner(120, -200, 'bottom-left')).toBe('top-right')
      expect(directionCorner(-120, -200, 'bottom-right')).toBe('top-left')
    })

    it('falls back to the quadrant the launcher sits in', () => {
      const size = {width: 56, height: 56}
      const viewport = {width: 1024, height: 768}
      expect(quadrantCorner({x: 8, y: 8}, size, viewport)).toBe('top-left')
      expect(quadrantCorner({x: 960, y: 8}, size, viewport)).toBe('top-right')
      expect(quadrantCorner({x: 8, y: 704}, size, viewport)).toBe('bottom-left')
      expect(quadrantCorner({x: 960, y: 704}, size, viewport)).toBe('bottom-right')
    })
  })

  describe('off screen edge', () => {
    const size = {width: 56, height: 56}
    const viewport = {width: 1024, height: 768}

    it('is null while the launcher centre stays on screen', () => {
      expect(offScreenEdge({x: 8, y: 8}, size, viewport)).toBeNull()
      expect(offScreenEdge({x: 960, y: 704}, size, viewport)).toBeNull()
      expect(offScreenEdge({x: -20, y: 300}, size, viewport)).toBeNull()
      expect(offScreenEdge({x: 990, y: 300}, size, viewport)).toBeNull()
    })

    it('reports the edge the centre crosses', () => {
      expect(offScreenEdge({x: -28, y: 300}, size, viewport)).toBe('left')
      expect(offScreenEdge({x: 996, y: 300}, size, viewport)).toBe('right')
      expect(offScreenEdge({x: 300, y: -28}, size, viewport)).toBe('top')
      expect(offScreenEdge({x: 300, y: 740}, size, viewport)).toBe('bottom')
    })

    it('prefers a side edge when the centre leaves through a corner', () => {
      expect(offScreenEdge({x: -40, y: -40}, size, viewport)).toBe('left')
      expect(offScreenEdge({x: 2000, y: 2000}, size, viewport)).toBe('right')
    })
  })

  describe('percent position', () => {
    it('maps the same percent to the same relative spot at any window size', () => {
      expect(toPixels(100, 8, 936)).toBe(936)
      expect(toPixels(0, 8, 936)).toBe(8)
      expect(toPixels(50, 8, 736)).toBe(372)
    })

    it('round-trips pixels through a percent', () => {
      expect(toPixels(toPercent(500, 8, 936), 8, 936)).toBeCloseTo(500)
    })

    it('keeps the launcher inside the walls', () => {
      expect(toPercent(2000, 8, 936)).toBe(100)
      expect(toPercent(-50, 8, 936)).toBe(0)
      expect(toPixels(250, 8, 936)).toBe(936)
      expect(toPercent(10, 8, 4)).toBe(0)
      expect(toPixels(100, 8, 4)).toBe(8)
    })
  })

  describe('stored placement', () => {
    it('reads a stored preset string from before free positions as that corner', () => {
      expect(parsePlacement('top-left')).toEqual({kind: 'corner', corner: 'top-left'})
      expect(parsePlacement('bottom-right')).toEqual({kind: 'corner', corner: 'bottom-right'})
      expect(parsePlacement('middle-left')).toEqual({kind: 'free', x: 0, y: 50})
    })

    it('reads a corner, a free spot and a hidden edge', () => {
      expect(parsePlacement('{"kind":"corner","corner":"top-right"}')).toEqual({kind: 'corner', corner: 'top-right'})
      expect(parsePlacement('{"kind":"free","x":30,"y":62.5}')).toEqual({kind: 'free', x: 30, y: 62.5})
      expect(parsePlacement('{"kind":"edge","edge":"left","along":40}')).toEqual({
        kind: 'edge',
        edge: 'left',
        along: 40,
      })
    })

    it('rejects anything else, so the configured position wins', () => {
      expect(parsePlacement('nowhere')).toBeUndefined()
      expect(parsePlacement('{"kind":"free","x":300,"y":10}')).toBeUndefined()
      expect(parsePlacement('{"kind":"edge","edge":"middle","along":40}')).toBeUndefined()
      expect(parsePlacement('{"kind":"corner"')).toBeUndefined()
    })

    it('starts a configured middle preset halfway down its side', () => {
      expect(presetPlacement('middle-right')).toEqual({kind: 'free', x: 100, y: 50})
      expect(presetPlacement('top-right')).toEqual({kind: 'corner', corner: 'top-right'})
    })
  })
})

describe('session title rank', () => {
  test.each([
    {title: 'OPENCODE CONSOLE', query: 'open con', rank: 1},
    {title: 'OPENCODE CONSOLE', query: 'OPENCODE CONSOLE', rank: 0},
    {title: 'OPENCODE CONSOLE', query: 'opencode console', rank: 0},
    {title: 'OPENCODE CONSOLE', query: 'console', rank: 2},
    {title: 'OPENCODE CONSOLE', query: 'OPENCODE CONSOLE ', rank: undefined},
    {title: 'OPENCODE CONSOLE', query: 'OPENCODE CONSOLE on', rank: undefined},
    {title: 'HOME', query: 'HOME ', rank: undefined},
    {title: 'HOME', query: 'home', rank: 0},
    {title: 'Home office', query: 'home', rank: 1},
    {title: 'Back home', query: 'home', rank: 2},
    {title: 'foobar', query: 'foo bar', rank: undefined},
    {title: 'foo bar', query: 'foo bar', rank: 0},
    {title: 'console', query: 'sole', rank: undefined},
  ])('$query against $title: $rank', (row) => {
    expect(rankSessionTitle(row.title, row.query)).toBe(row.rank)
  })
})

describe('draft reconcile', () => {
  const sameText = (local: {text: string}, row: {text: string}) => local.text === row.text

  test.each([
    {
      row: 'the engine row is the one this browser last synced, and the local copy is the same',
      local: {text: 'kept', syncedAt: 5},
      engine: {text: 'kept', updatedAt: 5},
      outcome: {kind: 'local', saveToEngine: false},
    },
    {
      row: 'the engine row is the one this browser last synced, and the local copy changed since',
      local: {text: 'typed offline', syncedAt: 5},
      engine: {text: 'kept', updatedAt: 5},
      outcome: {kind: 'local', saveToEngine: true},
    },
    {
      row: 'the engine row changed elsewhere',
      local: {text: 'stale here', syncedAt: 5},
      engine: {text: 'from the pop-out', updatedAt: 9},
      outcome: {kind: 'engine'},
    },
    {
      row: 'the engine row is a save this browser sent whose answer never came back',
      local: {text: 'typed after it', syncedAt: 5, sent: [7, 8]},
      engine: {text: 'held', updatedAt: 7},
      outcome: {kind: 'local', saveToEngine: true},
    },
    {
      row: 'a local copy whose sent saves never reached the engine, and no engine row',
      local: {text: 'engine was down', syncedAt: undefined, sent: [7]},
      engine: null,
      outcome: {kind: 'local', saveToEngine: true},
    },
    {
      row: 'a local copy that never synced, and no engine row',
      local: {text: 'engine was down', syncedAt: undefined},
      engine: null,
      outcome: {kind: 'local', saveToEngine: true},
    },
    {
      row: 'an engine row and no local copy',
      local: null,
      engine: {text: 'from another origin', updatedAt: 9},
      outcome: {kind: 'engine'},
    },
    {
      row: 'a synced local copy whose engine row is gone, after a send or a delete',
      local: {text: 'already sent', syncedAt: 5},
      engine: null,
      outcome: {kind: 'cleared'},
    },
    {row: 'neither copy', local: null, engine: null, outcome: {kind: 'empty'}},
  ])('$row', ({local, engine, outcome}) => {
    expect(reconcileDraft(local, engine, sameText)).toEqual(outcome)
  })
})

describe('internal plugin definitions', () => {
  test('defineInternalPlugin stamps the tag and types its setup with the internal ui members and returns the public definition type, Plugin.define does not', () => {
    const internal = defineInternalPlugin({
      setup(ctx) {
        expectTypeOf(ctx.ui.BasicTool).toBeFunction()
        expectTypeOf(ctx.ui.MentionField).toBeFunction()
        expectTypeOf(ctx.ui.Button).toBeFunction()
      },
    })
    const plain = Plugin.define({
      setup(ctx) {
        // @ts-expect-error a definition defineInternalPlugin did not stamp sees only the public ui
        expectTypeOf(ctx.ui.BasicTool).toBeFunction()
      },
    })

    expectTypeOf<SetupContext<typeof plain>['ui']>().not.toHaveProperty('Json')
    expect(internal).toMatchObject({$$type: '@conciv/InternalPlugin'})
    expect(isInternalPlugin(internal)).toBe(true)
    expect(isInternalPlugin(plain)).toBe(false)
  })
})

describe('tool catalog meta', () => {
  test('a plugin tool the engine lists without a label still reads its done label and icon from the client view', () => {
    const engineSignature = {
      name: 'tanstack_query_cache',
      path: ['tanstack_query_cache'],
      binding: 'server' as const,
      summary: 'Read the query cache.',
      category: 'tanstack',
      mutating: false,
      reachable: true,
      inputSchema: {type: 'object', properties: {}, required: []},
      outputSchema: undefined,
      errors: [],
    }
    const meta = mergeToolMeta(engineSignature, tanstackToolMeta('tanstack_query_cache'))
    expect(meta?.label?.done).toBe('Read the query cache')
    expect(meta?.icon).toBe('read')
    expect(meta?.summary).toBe('Read the query cache.')
  })
})
