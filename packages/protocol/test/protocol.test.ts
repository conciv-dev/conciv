import {createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {chatBusy} from '../src/chat-busy.js'
import {
  SessionId,
  isSessionId,
  isHarnessSessionId,
  SessionRecordSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
  ChatContentPartSchema,
  MAX_ATTACHMENT_RAW_BYTES,
} from '../src/chat-types.js'
import {defineFrameworkAdapter, type FrameworkClientCore, type FrameworkServerCore} from '../src/framework-types.js'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {
  decodeEntities,
  isDangerousTag,
  isDroppableAttribute,
  isLocalReference,
  neutralizeSubtree,
  type SanitizableNode,
} from '../src/element-capture-sanitize.js'
import {
  createEventBus,
  createEventBusClient,
  GLOBAL_EVENT,
  type EventBusEnvelope,
  type EventBusScheduler,
} from '../src/event-bus.js'
import {PageQuerySchema} from '../src/page-types.js'
import {TtyClientControlSchema, TtyServerControlSchema} from '../src/terminal-types.js'
import {aguiSnapshotFor, UiAnswerSchema, UiAnswerValueSchema, UiInputSchema} from '../src/ui-types.js'

describe('chat busy', () => {
  describe('chatBusy', () => {
    it('includes local and shared generation state', () => {
      const [status, setStatus] = createSignal('ready')
      const [sessionGenerating, setSessionGenerating] = createSignal(false)
      const chat = {status, sessionGenerating}

      expect(chatBusy(chat)).toBe(false)
      setSessionGenerating(true)
      expect(chatBusy(chat)).toBe(true)
      setSessionGenerating(false)
      setStatus('submitted')
      expect(chatBusy(chat)).toBe(true)
      setStatus('streaming')
      expect(chatBusy(chat)).toBe(true)
    })
  })
})

describe('chat types', () => {
  describe('SessionId (branded, conciv_ prefix)', () => {
    it('accepts an conciv_ id', () => {
      expect(SessionId.safeParse('conciv_018f3a2b-4c5d-6e7f').success).toBe(true)
    })
    it('rejects a non-conciv id (a raw harness token)', () => {
      expect(SessionId.safeParse('5d3f-claude-token').success).toBe(false)
    })
  })

  describe('isSessionId (branded guard)', () => {
    it('narrows an conciv_ string', () => {
      expect(isSessionId('conciv_018f3a2b-4c5d-6e7f')).toBe(true)
    })
    it('rejects a raw harness token and non-strings', () => {
      expect(isSessionId('5d3f-claude-token')).toBe(false)
      expect(isSessionId(null)).toBe(false)
      expect(isSessionId(42)).toBe(false)
    })
  })

  describe('SessionRecordSchema', () => {
    it('parses a new record (no harness id yet)', () => {
      const r = SessionRecordSchema.parse({
        id: 'conciv_1',
        harnessSessionId: null,
        harnessKind: 'claude',
        origin: 'chat',
        title: null,
        model: null,
        usage: null,
        cwd: '/app',
        createdAt: 1,
        updatedAt: 1,
      })
      expect(r.harnessSessionId).toBeNull()
    })
  })

  describe('ChatContentPartSchema', () => {
    it('accepts data images with a MIME type', () => {
      expect(
        ChatContentPartSchema.safeParse({
          type: 'image',
          source: {type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'},
        }).success,
      ).toBe(true)
    })

    it('rejects data images without a MIME type', () => {
      expect(ChatContentPartSchema.safeParse({type: 'image', source: {type: 'data', value: 'aGVsbG8='}}).success).toBe(
        false,
      )
    })

    it('rejects unsupported and missing image sources', () => {
      expect(ChatContentPartSchema.safeParse({type: 'image'}).success).toBe(false)
      expect(
        ChatContentPartSchema.safeParse({type: 'image', source: {type: 'url', value: 'https://example.com/image.png'}})
          .success,
      ).toBe(false)
    })
  })

  describe('ChatContentPartSchema document parts', () => {
    it('accepts a document part with a namespaced mime', () => {
      const parsed = ChatContentPartSchema.safeParse({
        type: 'document',
        source: {type: 'data', mimeType: 'application/x-conciv-recorder', value: 'eyJyZWNvcmRpbmdJZCI6InIxIn0='},
      })
      expect(parsed.success).toBe(true)
    })

    it('accepts a document value at the derived base64 cap and rejects one quantum above', () => {
      const capLength = Math.ceil(MAX_ATTACHMENT_RAW_BYTES / 3) * 4
      const atCap = ChatContentPartSchema.safeParse({
        type: 'document',
        source: {type: 'data', mimeType: 'application/x-test', value: 'a'.repeat(capLength)},
      })
      expect(atCap.success).toBe(true)
      const overCap = ChatContentPartSchema.safeParse({
        type: 'document',
        source: {type: 'data', mimeType: 'application/x-test', value: 'a'.repeat(capLength + 4)},
      })
      expect(overCap.success).toBe(false)
    })

    it('rejects an empty document value and a malformed mime', () => {
      expect(
        ChatContentPartSchema.safeParse({
          type: 'document',
          source: {type: 'data', mimeType: 'application/x-test', value: ''},
        }).success,
      ).toBe(false)
      expect(
        ChatContentPartSchema.safeParse({
          type: 'document',
          source: {type: 'data', mimeType: 'no-slash', value: 'aGVsbG8='},
        }).success,
      ).toBe(false)
    })

    it('accepts modelOnly metadata on a text part', () => {
      const parsed = ChatContentPartSchema.safeParse({type: 'text', content: 'x', metadata: {modelOnly: true}})
      expect(parsed.success).toBe(true)
    })
  })

  describe('ResolveRequestSchema', () => {
    it('allows an empty body (new session)', () => {
      expect(ResolveRequestSchema.parse({})).toEqual({})
    })
    it('echoes ResolveResponse with a branded id', () => {
      expect(ResolveResponseSchema.parse({sessionId: 'conciv_x'}).sessionId).toBe('conciv_x')
    })
  })

  describe('HarnessSessionId (branded, character-class constrained)', () => {
    it('accepts a plain harness token', () => {
      expect(isHarnessSessionId('018f3a2b-4c5d-6e7f')).toBe(true)
    })
    it('rejects a token carrying path or shell characters', () => {
      expect(isHarnessSessionId('../../etc/passwd')).toBe(false)
      expect(isHarnessSessionId('a b')).toBe(false)
      expect(isHarnessSessionId('a/b')).toBe(false)
      expect(isHarnessSessionId('a.b')).toBe(false)
    })
    it('rejects the empty token and one longer than 128 characters', () => {
      expect(isHarnessSessionId('')).toBe(false)
      expect(isHarnessSessionId('a'.repeat(129))).toBe(false)
    })
  })
})

describe('define framework adapter', () => {
  function coreClient(): FrameworkClientCore {
    return {
      detect: async () => ({name: 'tanstack-start', version: '1.0.0', router: 'file-based', dev: true}),
      routes: {
        current: async () => ({
          location: {pathname: '/posts/1', search: '', hash: ''},
          matches: [
            {
              id: 'm1',
              routeId: '/posts/$id',
              path: '/posts/1',
              params: {id: '1'},
              search: {},
              status: 'success',
              error: null,
              loaderData: {title: 'hi'},
              updatedAt: null,
              isFetching: false,
            },
          ],
        }),
        tree: async () => ({id: 'root', path: '/', kind: 'layout', hasLoader: false, children: []}),
      },
      navigation: {
        navigate: async () => {},
        back: async () => {},
        refresh: async () => {},
      },
      data: {
        entries: async () => [],
        get: async () => undefined,
        invalidate: async () => {},
      },
      errors: {
        snapshot: async () => [],
      },
    }
  }

  function coreServer(): FrameworkServerCore {
    return {
      manifest: {routes: async () => [{path: '/posts/$id', kind: 'page', dynamic: true, file: null}]},
      errors: {snapshot: async () => []},
      events: {subscribe: () => () => {}},
      logs: {tail: async () => []},
    }
  }

  describe('defineFrameworkAdapter (capability flags force gated surfaces at compile time)', () => {
    it('returns a capability-empty adapter unchanged, with no gated surfaces present', async () => {
      const adapter = defineFrameworkAdapter({
        name: 'astro',
        client: coreClient(),
        server: coreServer(),
        capabilities: {queryCache: false, serverFunctions: false, rscPayload: false, isr: false, middleware: false},
      })

      expect(adapter.name).toBe('astro')
      expect('queryCache' in adapter).toBe(false)
      expect('payload' in adapter).toBe(false)
      expect((await adapter.client.routes.current()).matches[0]?.params.id).toBe('1')
      expect((await adapter.server.manifest.routes())[0]?.dynamic).toBe(true)
    })

    it('accepts an adapter that provides every gated surface its capabilities require', async () => {
      const adapter = defineFrameworkAdapter({
        name: 'nextjs',
        client: coreClient(),
        server: coreServer(),
        capabilities: {queryCache: true, serverFunctions: true, rscPayload: true, isr: true, middleware: true},
        queryCache: {
          queries: async () => [],
          mutations: async () => [],
          invalidate: async () => {},
          refetch: async () => {},
        },
        payload: {snapshot: async () => ({kind: 'flight', tree: {}, mismatches: []})},
        serverFunctions: {list: async () => [], traces: async () => []},
        isr: {entries: async () => [], revalidate: async () => {}},
        middleware: {list: async () => []},
      })

      expect(adapter.capabilities.rscPayload).toBe(true)
      expect((await adapter.payload?.snapshot())?.kind).toBe('flight')
      expect(await adapter.queryCache?.queries()).toEqual([])
      expect(await adapter.isr?.entries()).toEqual([])
    })
  })
})
