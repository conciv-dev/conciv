import {createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import type {ChatClientState} from '@tanstack/ai-client'
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
import {EventType} from '@tanstack/ai'
import type {AnyTextAdapter} from '@tanstack/ai'
import {defineHarness, type TranscriptHandle} from '../src/harness-types.js'
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
import {UsageSnapshotSchema, contextUsedTokens} from '../src/usage-types.js'

describe('chat busy', () => {
  describe('chatBusy', () => {
    it('includes local and shared generation state', () => {
      const [status, setStatus] = createSignal<ChatClientState>('ready')
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

describe('define harness', () => {
  const stubHandle: TranscriptHandle = {
    revision: () => Promise.resolve({ok: false, reason: 'missing', detail: 'stub'}),
    read: () => Promise.resolve({ok: false, reason: 'missing', detail: 'stub'}),
    close: () => {},
  }

  const fakeAdapter: AnyTextAdapter = {
    kind: 'text',
    name: 'fake',
    model: 'fake',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {
        text: undefined,
        image: undefined,
        audio: undefined,
        video: undefined,
        document: undefined,
      },
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    chatStream: async function* () {},
    structuredOutput: () => Promise.reject(new Error('fake adapter')),
  }

  const base = {
    id: 'x',
    binName: 'x',
    chatConfig: () => ({adapter: fakeAdapter}),
  }

  describe('defineHarness (generic typed factory; history↔transcriptHistory enforced by the type)', () => {
    it('returns the adapter unchanged when capabilities match members', () => {
      const adapter = defineHarness({
        ...base,
        capabilities: {
          resume: false,
          permissionGate: 'none',
          transcriptHistory: false,
          compaction: false,
          systemPrompt: 'none',
          mcp: 'none',
          slashCommands: 'none',
          imageInput: false,
          init: 'none',
        },
      })
      expect(adapter.id).toBe('x')

      expect('history' in adapter).toBe(false)
    })

    it('accepts a transcriptHistory harness that provides a history implementation', () => {
      const adapter = defineHarness({
        ...base,
        capabilities: {
          resume: false,
          permissionGate: 'none',
          transcriptHistory: true,
          compaction: false,
          systemPrompt: 'none',
          mcp: 'none',
          slashCommands: 'none',
          imageInput: false,
          init: 'none',
        },
        history: {
          messages: () => Promise.resolve([]),
          observe: () => stubHandle,
          list: () => Promise.resolve([]),
        },
      })
      expect(typeof adapter.history?.messages).toBe('function')
    })
  })
})

describe('element capture sanitize', () => {
  function elementNode(
    tagName: string,
    attributes: Record<string, unknown>,
    children: SanitizableNode[] = [],
  ): SanitizableNode {
    return {type: 2, tagName, attributes, childNodes: children}
  }

  describe('decodeEntities refuses to guess at an entity it cannot decode', () => {
    it('decodes hexadecimal, decimal and named entities', () => {
      expect(decodeEntities('&#x6a;&#97;&amp;')).toBe('ja&')
    })

    it('returns undefined for a code point above the unicode maximum instead of throwing', () => {
      expect(decodeEntities('&#x110000;')).toBeUndefined()
      expect(decodeEntities('&#1114112;')).toBeUndefined()
    })

    it('leaves an unknown named entity untouched', () => {
      expect(decodeEntities('&nosuchentity;')).toBe('&nosuchentity;')
    })
  })

  describe('isLocalReference fails closed', () => {
    it('accepts fragments and data URIs', () => {
      expect(isLocalReference('#gradient')).toBe(true)
      expect(isLocalReference('data:image/png;base64,AAAA')).toBe(true)
    })

    it('rejects remote URLs, javascript URLs and obfuscated variants', () => {
      expect(isLocalReference('https://example.com/a.png')).toBe(false)
      expect(isLocalReference('/local/a.png')).toBe(false)
      expect(isLocalReference('javascript:alert(1)')).toBe(false)
      expect(isLocalReference('java\tscript:alert(1)')).toBe(false)
      expect(isLocalReference('&#x6a;avascript:alert(1)')).toBe(false)
    })

    it('rejects a value carrying an undecodable entity', () => {
      expect(isLocalReference('&#x110000;#')).toBe(false)
    })
  })

  describe('isDroppableAttribute', () => {
    it('drops every event handler attribute', () => {
      expect(isDroppableAttribute('onerror', 'boom()')).toBe(true)
      expect(isDroppableAttribute('ONCLICK', 'boom()')).toBe(true)
    })

    it('drops url-bearing attributes unless the value is local', () => {
      expect(isDroppableAttribute('src', 'https://example.com/a.png')).toBe(true)
      expect(isDroppableAttribute('srcset', '/a.png 1x')).toBe(true)
      expect(isDroppableAttribute('poster', '/a.png')).toBe(true)
      expect(isDroppableAttribute('background', '/a.png')).toBe(true)
      expect(isDroppableAttribute('action', '/submit')).toBe(true)
      expect(isDroppableAttribute('data', '/thing.swf')).toBe(true)
      expect(isDroppableAttribute('xlink:href', '#gradient')).toBe(false)
      expect(isDroppableAttribute('src', 'data:image/png;base64,AAAA')).toBe(false)
    })

    it('drops an inline style that references a url, directly or through a CSS escape', () => {
      expect(isDroppableAttribute('style', 'background-image:url(/a.png)')).toBe(true)
      expect(isDroppableAttribute('style', 'background:image-set("/a.png" 1x)')).toBe(true)
      expect(isDroppableAttribute('style', 'background:u\\72l(/a.png)')).toBe(true)
      expect(isDroppableAttribute('style', 'color:red')).toBe(false)
    })

    it('drops a non-raster rr_dataURL, decoded and stripped like every url check', () => {
      expect(isDroppableAttribute('rr_dataURL', 'https://evil.example/x.png')).toBe(true)
      expect(isDroppableAttribute('rr_dataURL', 'https&colon;//evil.example/x.png')).toBe(true)
      expect(isDroppableAttribute('rr_dataURL', 'javascript:alert(1)')).toBe(true)
      expect(isDroppableAttribute('rr_dataURL', '&#x110000;data:image/png,AAAA')).toBe(true)
      expect(isDroppableAttribute('rr_dataURL', 42)).toBe(true)
      expect(isDroppableAttribute('rr_dataURL', 'data:text/html,<script>boom()</script>')).toBe(true)
      expect(isDroppableAttribute('rr_dataURL', 'data:image/webp;base64,AAAA')).toBe(false)
      expect(isDroppableAttribute('rr_dataURL', 'data:image/png;base64,AAAA')).toBe(false)
    })

    it('keeps ordinary attributes', () => {
      expect(isDroppableAttribute('class', 'card')).toBe(false)
      expect(isDroppableAttribute('value', 'ada@example.com')).toBe(false)
    })
  })

  describe('isDangerousTag', () => {
    it('flags the tags that execute or fetch on rebuild', () => {
      for (const tagName of ['iframe', 'object', 'embed', 'script', 'link', 'style', 'SCRIPT']) {
        expect(isDangerousTag({type: 2, tagName})).toBe(true)
      }
    })

    it('leaves ordinary tags alone', () => {
      expect(isDangerousTag({type: 2, tagName: 'div'})).toBe(false)
      expect(isDangerousTag({type: 3})).toBe(false)
    })
  })

  describe('neutralizeSubtree', () => {
    it('strips dangerous children, handler attributes, remote urls and the custom-element flag', () => {
      const tree: SanitizableNode = {
        type: 2,
        tagName: 'div',
        isCustom: true,
        attributes: {class: 'card', onclick: 'boom()'},
        childNodes: [
          elementNode('script', {}),
          elementNode('link', {rel: 'stylesheet', href: '/sheet.css'}),
          elementNode('img', {src: 'https://example.com/a.png', srcset: '/a.png 1x'}),
          elementNode('a', {href: 'javascript:alert(1)'}, [elementNode('span', {onmouseover: 'boom()'})]),
        ],
      }

      neutralizeSubtree(tree)

      expect(tree.isCustom).toBeUndefined()
      expect(tree.attributes).toEqual({class: 'card'})
      expect(tree.childNodes?.map((child) => child.tagName)).toEqual(['img', 'a'])
      expect(tree.childNodes?.[0]?.attributes).toEqual({})
      expect(tree.childNodes?.[1]?.attributes).toEqual({})
      expect(tree.childNodes?.[1]?.childNodes?.[0]?.attributes).toEqual({})
    })

    it('drops a hostile rr_dataURL from a stored capture but keeps an inlined raster image', () => {
      const tree = elementNode('div', {}, [
        elementNode('img', {rr_dataURL: 'https://evil.example/x.png'}),
        elementNode('img', {rr_dataURL: 'data:image/webp;base64,AAAA'}),
      ])

      neutralizeSubtree(tree)

      expect(tree.childNodes?.[0]?.attributes).toEqual({})
      expect(tree.childNodes?.[1]?.attributes).toEqual({rr_dataURL: 'data:image/webp;base64,AAAA'})
    })

    it('never throws on an attribute carrying an out-of-range numeric character reference', () => {
      const tree = elementNode('a', {href: '&#x110000;javascript:alert(1)'})

      neutralizeSubtree(tree)

      expect(tree.attributes).toEqual({})
    })

    it('strips a meta refresh that could navigate the replica frame', () => {
      const tree: SanitizableNode = {
        type: 2,
        tagName: 'div',
        attributes: {},
        childNodes: [elementNode('meta', {'http-equiv': 'refresh', content: '0;url=https://evil.example/'})],
      }

      neutralizeSubtree(tree)

      expect(tree.childNodes?.map((child) => child.tagName)).toEqual([])
    })
  })
})

describe('event bus', () => {
  type CommandMap = {
    open: undefined
    close: undefined
  }

  function createManualScheduler(): {scheduler: EventBusScheduler; tick: () => void; intervalCount: () => number} {
    const callbacks = new Map<number, () => void>()
    let nextId = 0
    return {
      scheduler: {
        setInterval: (callback) => {
          const id = nextId
          nextId += 1
          callbacks.set(id, callback)
          return id
        },
        clearInterval: (id) => {
          if (typeof id !== 'number') return
          callbacks.delete(id)
        },
      },
      tick: () => {
        for (const callback of callbacks.values()) callback()
      },
      intervalCount: () => callbacks.size,
    }
  }

  describe('createEventBusClient / createEventBus', () => {
    it('queues emits made before the handshake completes and flushes them in order once acked', () => {
      const target = new EventTarget()
      const {scheduler, tick} = createManualScheduler()
      const received: unknown[] = []
      const bus = createEventBus({target: () => target})
      const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      listener.on('open', (event) => received.push([event.type, event.pluginId]))
      listener.on('close', (event) => received.push([event.type, event.pluginId]))

      const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      client.emit('open', undefined)
      client.emit('close', undefined)
      expect(received).toEqual([])
      expect(client.getState()).toBe('connecting')

      bus.start()
      expect(received).toEqual([])

      tick()
      expect(received).toEqual([
        ['panel:open', 'panel'],
        ['panel:close', 'panel'],
      ])
      expect(client.getState()).toBe('ready')
    })

    it('stops retrying once the bus acks the connection', () => {
      const target = new EventTarget()
      const {scheduler, tick, intervalCount} = createManualScheduler()
      const bus = createEventBus({target: () => target})
      bus.start()

      const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      client.emit('open', undefined)
      expect(client.getState()).toBe('ready')
      expect(intervalCount()).toBe(0)

      tick()
      expect(client.getState()).toBe('ready')
    })

    it('gives up after the bounded retry count and drops the queue', () => {
      const target = new EventTarget()
      const {scheduler, tick} = createManualScheduler()
      const client = createEventBusClient<CommandMap>({
        pluginId: 'panel',
        target: () => target,
        scheduler,
        maxRetries: 2,
      })

      client.emit('open', undefined)
      expect(client.getState()).toBe('connecting')

      tick()
      expect(client.getState()).toBe('connecting')

      tick()
      expect(client.getState()).toBe('failed')

      const received: unknown[] = []
      const bus = createEventBus({target: () => target})
      const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      listener.on('open', (event) => received.push(event))
      bus.start()
      expect(received).toEqual([])
    })

    it('restarts the handshake with a fresh retry budget when emit is called again after failure', () => {
      const target = new EventTarget()
      const {scheduler, tick} = createManualScheduler()
      const client = createEventBusClient<CommandMap>({
        pluginId: 'panel',
        target: () => target,
        scheduler,
        maxRetries: 2,
      })

      client.emit('open', undefined)
      tick()
      tick()
      expect(client.getState()).toBe('failed')

      client.emit('close', undefined)
      expect(client.getState()).toBe('connecting')

      const received: unknown[] = []
      const bus = createEventBus({target: () => target})
      const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      listener.on('close', (event) => received.push(event.type))
      bus.start()
      expect(received).toEqual([])

      tick()
      expect(received).toEqual(['panel:close'])
      expect(client.getState()).toBe('ready')
    })

    it('passes an emit straight through once the client is already connected', () => {
      const target = new EventTarget()
      const {scheduler} = createManualScheduler()
      const received: unknown[] = []
      const bus = createEventBus({target: () => target})
      const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      listener.on('open', (event) => received.push(event.payload))
      bus.start()

      const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      client.emit('open', undefined)
      expect(client.getState()).toBe('ready')

      client.emit('open', undefined)
      expect(received).toEqual([undefined, undefined])
    })

    it('re-dispatches every emit as both the specific envelope event and the global event', () => {
      const target = new EventTarget()
      const {scheduler} = createManualScheduler()
      const specific: EventBusEnvelope[] = []
      const global: EventBusEnvelope[] = []
      const bus = createEventBus({target: () => target})
      bus.start()
      target.addEventListener('panel:open', (event) => {
        if (event instanceof CustomEvent) specific.push(event.detail)
      })
      target.addEventListener(GLOBAL_EVENT, (event) => {
        if (event instanceof CustomEvent) global.push(event.detail)
      })

      const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      client.emit('open', undefined)

      expect(specific).toEqual([{type: 'panel:open', payload: undefined, pluginId: 'panel'}])
      expect(global).toEqual([{type: 'panel:open', payload: undefined, pluginId: 'panel'}])
    })

    it('filters onAll down to the listening client own pluginId', () => {
      const target = new EventTarget()
      const {scheduler} = createManualScheduler()
      const seen: string[] = []
      const bus = createEventBus({target: () => target})
      bus.start()

      const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      listener.onAll((event) => seen.push(event.type))

      const panelClient = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      const otherClient = createEventBusClient<CommandMap>({pluginId: 'other', target: () => target, scheduler})
      otherClient.emit('open', undefined)
      panelClient.emit('close', undefined)

      expect(seen).toEqual(['panel:close'])
    })

    it('stops delivering to a listener that unsubscribed and to every listener once the bus stops', () => {
      const target = new EventTarget()
      const {scheduler} = createManualScheduler()
      const seen: string[] = []
      const bus = createEventBus({target: () => target})
      bus.start()

      const listener = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      const unsubscribe = listener.on('open', (event) => seen.push(event.type))

      const client = createEventBusClient<CommandMap>({pluginId: 'panel', target: () => target, scheduler})
      client.emit('open', undefined)
      expect(seen).toEqual(['panel:open'])

      unsubscribe()
      client.emit('open', undefined)
      expect(seen).toEqual(['panel:open'])

      listener.on('close', (event) => seen.push(event.type))
      bus.stop()
      client.emit('close', undefined)
      expect(seen).toEqual(['panel:open'])
    })
  })
})

describe('page wire', () => {
  describe('page wire envelope', () => {
    it('carries requestId, name and input and nothing kind-shaped', () => {
      const parsed = PageQuerySchema.parse({requestId: 'pq1', name: 'page_click', input: {selector: '#go'}})
      expect(parsed).toEqual({requestId: 'pq1', name: 'page_click', input: {selector: '#go'}})
    })

    it('rejects a nameless query', () => {
      expect(PageQuerySchema.safeParse({requestId: 'pq1', input: {}}).success).toBe(false)
    })
  })
})

describe('terminal types', () => {
  describe('terminal types', () => {
    it('parses client control frames', () => {
      expect(TtyClientControlSchema.parse({type: 'resize', cols: 120, rows: 32})).toEqual({
        type: 'resize',
        cols: 120,
        rows: 32,
      })
      expect(TtyClientControlSchema.safeParse({type: 'resize', cols: 'x'}).success).toBe(false)
    })

    it('parses server control frames', () => {
      expect(TtyServerControlSchema.parse({type: 'exit', code: 0})).toEqual({type: 'exit', code: 0})
      expect(TtyServerControlSchema.parse({type: 'busy', busy: true})).toEqual({type: 'busy', busy: true})
      expect(TtyServerControlSchema.parse({type: 'error', message: 'boom'})).toEqual({type: 'error', message: 'boom'})
    })
  })
})

describe('ui types', () => {
  describe('snapshot event', () => {
    it('snapshot is a native MESSAGES_SNAPSHOT chunk carrying UIMessages verbatim', () => {
      const messages = [{id: 'm1', role: 'user' as const, parts: [{type: 'text' as const, content: 'hi'}]}]
      const chunk = aguiSnapshotFor(messages)
      expect(chunk.type).toBe(EventType.MESSAGES_SNAPSHOT)
      if (chunk.type === EventType.MESSAGES_SNAPSHOT) expect(chunk.messages).toEqual(messages)
    })
  })

  describe('blocking conciv_ui schemas', () => {
    it('UiInputSchema accepts each kind with its fields', () => {
      expect(UiInputSchema.parse({kind: 'choices', question: 'theme?', options: ['light', 'dark']}).kind).toBe(
        'choices',
      )
      expect(UiInputSchema.parse({kind: 'confirm', question: 'run?', detail: 'pnpm build'}).kind).toBe('confirm')
      expect(UiInputSchema.parse({kind: 'diff', file: 'a.ts', before: 'x', after: 'y'}).kind).toBe('diff')
      expect(UiInputSchema.parse({kind: 'form', fields: [{name: 'path', label: 'Path', type: 'text'}]}).kind).toBe(
        'form',
      )
      expect(UiInputSchema.safeParse({kind: 'vitest'}).success).toBe(false)
    })

    it('a choices ask carries multiSelect and allowOther, the shape that replaces the native AskUserQuestion', () => {
      const parsed = UiInputSchema.parse({
        kind: 'choices',
        question: 'Which effects need live tuning knobs?',
        options: ['Ferrofluid', 'Shader glow'],
        multiSelect: true,
        allowOther: true,
      })
      expect(parsed.multiSelect).toBe(true)
      expect(parsed.allowOther).toBe(true)
      expect(UiInputSchema.parse({kind: 'choices', options: ['a']}).multiSelect).toBeUndefined()
    })

    it('UiAnswerValueSchema is a string, a string list or a string record, nothing else', () => {
      expect(UiAnswerValueSchema.parse('yes')).toBe('yes')
      expect(UiAnswerValueSchema.parse(['ship', 'hold'])).toEqual(['ship', 'hold'])
      expect(UiAnswerValueSchema.parse({path: '/docs'})).toEqual({path: '/docs'})
      expect(UiAnswerValueSchema.safeParse(42).success).toBe(false)
      expect(UiAnswerValueSchema.safeParse({n: 42}).success).toBe(false)
      expect(UiAnswerValueSchema.safeParse([42]).success).toBe(false)
    })

    it('UiAnswerSchema is the answered/unanswered union', () => {
      expect(UiAnswerSchema.parse({answered: true, value: 'yes'})).toEqual({answered: true, value: 'yes'})
      expect(UiAnswerSchema.parse({answered: false, note: 'timed out'})).toEqual({answered: false, note: 'timed out'})
      expect(UiAnswerSchema.safeParse({answered: true}).success).toBe(false)
      expect(UiAnswerSchema.safeParse({answered: false, value: 'yes'}).success).toBe(false)
    })
  })
})

describe('usage types', () => {
  describe('usage-types', () => {
    it('parses a partial snapshot (all fields optional)', () => {
      expect(UsageSnapshotSchema.safeParse({}).success).toBe(true)
      const r = UsageSnapshotSchema.safeParse({inputTokens: 10, contextWindow: 200000})
      expect(r.success && r.data.inputTokens).toBe(10)
    })

    it('rejects negative tokens', () => {
      expect(UsageSnapshotSchema.safeParse({inputTokens: -1}).success).toBe(false)
    })

    it('reports occupancy from contextTokens, never the billing sum', () => {
      expect(
        contextUsedTokens({contextTokens: 92000, inputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 10}),
      ).toBe(92000)
    })

    it('returns undefined when no occupancy is present (billing totals are not occupancy)', () => {
      expect(contextUsedTokens({inputTokens: 773000, cacheReadTokens: 700000, totalCostUsd: 1})).toBeUndefined()
    })
  })
})
