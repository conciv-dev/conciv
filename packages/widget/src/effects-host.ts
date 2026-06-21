import {createSignal} from 'solid-js'
import type {ClientApi, EffectCtx, EffectDefinition} from '@mandarax/extensions'
import {createTransport} from './transport.js'
import {EditorOpenSchema} from '@mandarax/protocol/test-types'
import {OkSchema} from '@mandarax/protocol/chat-types'
import {OpenSourceSchema, OpenSourceResultSchema} from '@mandarax/protocol/page-types'
import {
  componentHostAt,
  describe as describeHost,
  locate as locateEl,
  inspect as inspectEl,
  tree as treeOf,
  find as findByName,
  type LocateResult,
} from './react-bridge.js'
import {addRef, type Refs} from './page-snapshot.js'
import {makeEffects} from './page-effects.js'
import {showToast} from './effect-toast.js'
import {registerWind4Properties} from './shadow.js'
import type {PageHandler} from './page-handlers.js'
import {err} from '@mandarax/protocol/page-types'
import styles from './styles.css?inline'

const EFFECTS_MARKER = 'data-mandarax-effects'

type EffectHostDeps = {
  apiBase: string
  refs: Refs
  runTool: ClientApi['runTool']
  db: ClientApi['db']
  sync: ClientApi['sync']
  previewId: string
  sessionId: () => string | null
}

function makeEffectCtx(deps: EffectHostDeps): Omit<EffectCtx, 'disable'> {
  const server = createTransport({apiBase: deps.apiBase})
  const openEditor = server.route({
    method: 'POST',
    path: '/api/editor/open',
    request: EditorOpenSchema,
    response: OkSchema,
  })
  const openSourceRoute = server.route({
    method: 'POST',
    path: '/api/page/open-source',
    request: OpenSourceSchema,
    response: OpenSourceResultSchema,
  })
  const openSource = async (loc: LocateResult): Promise<'opened' | 'no-source' | 'failed'> => {
    try {
      if (loc.source) {
        await openEditor({file: loc.source.file, line: loc.source.line})
        return 'opened'
      }
      if (loc.frames.length) return (await openSourceRoute({frames: loc.frames})).status
      return 'no-source'
    } catch {
      return 'failed'
    }
  }
  return {
    page: {
      elementAt: (x, y) => {
        const host = document.querySelector<HTMLElement>(`[${EFFECTS_MARKER}]`)
        const prev = host?.style.pointerEvents
        if (host) host.style.pointerEvents = 'none'
        const el = document.elementFromPoint(x, y)
        if (host) host.style.pointerEvents = prev ?? ''
        return el
      },
      componentHostAt,
      describe: describeHost,
      locate: (el) => locateEl(el, deps.refs),
      inspect: (el) => inspectEl(el),
      tree: () => treeOf(document.body, deps.refs),
      find: (name) => findByName(name, deps.refs),
      addRef: (el) => addRef(el, deps.refs),
    },
    openSource,
    toast: showToast,
    env: {reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches, doc: document, win: window},
    runTool: deps.runTool,
    db: deps.db,
    sync: deps.sync,
    previewId: deps.previewId,
    sessionId: deps.sessionId,
  }
}

// Build the effect host: a stateless makeEffects dispatcher over an instance signal of effects, the
// page `effect` verb handler injected into the driver, and applyEffects to upsert contributed effects.
export function createEffectsHost(deps: EffectHostDeps) {
  registerWind4Properties()
  const [effects, setEffects] = createSignal<readonly EffectDefinition[]>([])
  const fx = makeEffects(() => effects(), makeEffectCtx(deps), styles)

  const applyEffects = (next: readonly EffectDefinition[]): void => {
    setEffects((prev) => {
      const byName = new Map(prev.map((e) => [e.name, e]))
      for (const e of next) byName.set(e.name, e)
      return [...byName.values()]
    })
  }

  const effectHandler: PageHandler = ({query}) => {
    const action = query.action ?? 'list'
    if (action === 'list') return fx.listEffects()
    if (!query.effect) return err('effect requires --effect')
    return action === 'toggle' ? fx.toggleEffect(query.effect) : fx.setEffect(query.effect, action === 'enable')
  }

  return {effectHandler, applyEffects}
}
