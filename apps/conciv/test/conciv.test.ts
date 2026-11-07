import {expect, test as baseTest, describe, it, test} from 'vitest'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {appendDraft, makeDraftStorage, type ServerDraft} from '../src/pane/draft-storage.js'
import {createSession, seedDraft, proxyTo, type ProxyCore} from './helpers.node.js'
import type {Grab} from '@conciv/grab'
import {resolveGrabSource} from '../src/pane/grab-source-resolve.js'
import {QuickSearchSchema, quickPaneIds, quickSearchFor} from '../src/lib/quick-search.js'
import {WS_RPC_PAYLOAD_BUDGET_BYTES} from '@conciv/protocol/rpc-types'
import {checkSend, MAX_CONTENT_PARTS} from '../src/pane/send-checks.js'
import {parseConcivSettings} from '../src/data/settings.js'
import {foldToolDurations, type ToolPartLike} from '../src/pane/tool-durations.js'
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
    const draftStorage = makeDraftStorage(makeRpcClient(core.base), sessionId)
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

  test('a composer cleared before the server draft arrives clears the server draft', async ({kit, core, sessionId}) => {
    await seedDraft(kit.rpc, sessionId, {text: 'stale on the server'})
    const draftStorage = makeDraftStorage(makeRpcClient(core.base), sessionId)

    draftStorage.storage.setItem('any', composerDraft('typed early'))
    draftStorage.storage.setItem('any', composerDraft(''))
    const restored: ServerDraft[] = []
    await draftStorage.restore((draft) => restored.push(draft), new AbortController().signal)
    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(restored).toEqual([])
    expect(await storedDraft(kit.rpc, sessionId)).toMatchObject({text: ''})
  })

  test('clearing a restored draft before its first write reaches the server', async ({kit, core, sessionId}) => {
    await seedDraft(kit.rpc, sessionId, {text: 'restored then cleared'})
    const draftStorage = makeDraftStorage(makeRpcClient(core.base), sessionId)
    await draftStorage.restore(() => {}, new AbortController().signal)

    draftStorage.storage.setItem('any', composerDraft(''))
    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toMatchObject({text: ''})
  })

  test('the latest text typed before the server draft arrives is written once it has', async ({
    kit,
    core,
    sessionId,
  }) => {
    const draftStorage = makeDraftStorage(makeRpcClient(core.base), sessionId)

    draftStorage.storage.setItem('any', composerDraft('typed while loading'))
    await draftStorage.restore(() => {}, new AbortController().signal)
    await core.awaitRequest(DRAFTS_SET_PATH)

    expect(await storedDraft(kit.rpc, sessionId)).toMatchObject({text: 'typed while loading'})
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

    const draftStorage = makeDraftStorage(makeRpcClient(core.base), sessionId)
    const restored: ServerDraft[] = []
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

    it('hands back the same record while no call settles, so readers of one duration stay quiet', () => {
      const startedAt = new Map<string, number>()
      const clock = makeClock(0)
      const first = foldToolDurations(
        [message({type: 'tool-call', id: 'a', state: 'pending'})],
        startedAt,
        clock.now,
        {},
      )
      clock.advance(10)
      const second = foldToolDurations(
        [
          message({type: 'tool-call', id: 'a', state: 'pending'}),
          message({type: 'tool-call', id: 'b', state: 'pending'}),
        ],
        startedAt,
        clock.now,
        first,
      )
      expect(second).toBe(first)
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
