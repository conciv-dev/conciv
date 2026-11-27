import {Effect, Fiber, Layer, Scope} from 'effect'
import {z} from 'zod'
import {onCleanup} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {useQueryClient} from '@conciv/client'
import {createScopedRuntime, createKeyed, Plugin, Slot, Style, ToolRegistry} from '@conciv/frontend-plugin-api'
import {NoteCard, OpaqueNoteCard} from '@internal/frontend-app-api'
import {BrowserTabUrl, Page, PageOperation, ReactTree} from '@conciv/frontend-plugin-api/page'
import {GrabPicker} from '@conciv/frontend-plugin-api/grab'
import {answerCommands} from './attachment.js'
import {makeHighlight} from './highlight.js'
import {symbolicateInSession} from './open-source.js'
import {makePageOperations} from './operations.js'
import {pageToolCards} from './cards.js'
import {SessionCaptures} from './captures.js'
import {Definition} from './rpc.js'
import {PageFailedTool} from './shared.js'
import {makeSimulator} from './simulator.js'
import {CONCIV_UI_SELECTOR} from './conciv-ui.js'
import {addRef, type Refs} from './snapshot.js'
import {dehydrate} from './dehydrate.js'
import {describe, installReactBridge, locate, makeTracker, reactBridge, rootFibers} from './react.js'
import {createReactGrab} from './grab.js'
import {makeGrabNotePicker} from './grab-note.js'
import {GrabNoteCard} from './grab-card.js'
import {GRAB_NOTE_ORIGIN} from './rpc.js'
import {capturePlugins} from './screenshot.js'
import {redactedUrl} from './redacted-url.js'
import pluginCss from 'virtual:uno.css?inline'

const PageOptionsSchema = z.object({taskTimeoutMs: z.number().int().positive().optional()}).catch({})

export default Plugin.define({
  enforce: 'pre',
  beforeRegister: installReactBridge,
  setup(ctx) {
    ctx.add(Style, pluginCss)
    const routed = () => ctx.sessions.current()

    const queryClient = useQueryClient()
    const symbolicate = symbolicateInSession(routed, queryClient)

    const highlight = makeHighlight({
      opener: {symbolicate, desktop: ctx.desktop},
      toast: (title, variant) => void ctx.toast.show({title, variant}),
    })
    const {runtime, scope} = createScopedRuntime(Layer.empty)
    const simulator = runtime.runSync(
      makeSimulator({
        session: () => routed()?.id ?? null,
        running: (sessionId) => routed()?.id === sessionId && routed()?.run.status() === 'running',
        taskTimeoutMs: () => PageOptionsSchema.parse(ctx.options).taskTimeoutMs,
        onStop: (sessionId) => {
          const session = routed()

          if (session?.id === sessionId) void session.run.interrupt()
        },
      }).pipe(Scope.provide(scope)),
    )
    const tracker = makeTracker()
    onCleanup(tracker.dispose)
    const operations = makePageOperations(
      [highlight.effect],
      simulator,
      tracker,
      (title) => void ctx.toast.show({title, variant: 'error'}),
    )

    createKeyed(
      () => {
        const session = routed()

        return session?.server.compatible && session.server.connected ? session : undefined
      },
      (session) => {
        const answering = Effect.runFork(
          answerCommands({session, operations, registered: () => ctx.list(PageOperation)}),
        )

        onCleanup(() => void Effect.runFork(Fiber.interrupt(answering)))
      },
    )

    ctx.add(Slot, {
      at: 'page.overlay',
      hides: false,
      render: () => <div ref={(element) => onCleanup(simulator.mount(element))} />,
    })

    createKeyed(
      () => {
        const session = routed()

        return session?.run.status() === 'running' ? session : undefined
      },
      (session) => onCleanup(() => simulator.endRun(session.id)),
    )

    createKeyed(
      () => routed()?.server.client,
      (client) => {
        const page = client.rpc(Definition)
        onCleanup(
          page.events.on('captures.saved', (event) =>
            queryClient.invalidateQueries({queryKey: page['captures.list'].key({input: event.data})}),
          ),
        )
      },
    )

    onCleanup(highlight.mount(ctx.overlay().element))

    pageToolCards.forEach(({card, tools}) =>
      tools.forEach((name) =>
        ctx.add(ToolRegistry, {
          name,
          render: (props) => (
            <SessionCaptures sessionID={props.sessionID}>
              <Dynamic component={card} {...props} />
            </SessionCaptures>
          ),
          errorComponent: PageFailedTool,
        }),
      ),
    )
    const grab = createReactGrab()
    ctx.add(
      GrabPicker,
      makeGrabNotePicker(grab.api, {
        session: routed,
        screen: ctx.screen,
        symbolicate: (input) => symbolicate(input.frames),
      }),
    )
    ctx.add(OpaqueNoteCard.toInternal(NoteCard), {
      origins: [GRAB_NOTE_ORIGIN],
      render: (props) => <GrabNoteCard {...props} />,
    })
    ctx.provide(Page, {
      toast: (message, tone) =>
        void ctx.toast.show({title: message, variant: tone === 'error' || tone === 'success' ? tone : 'default'}),
      capture: {exclude: CONCIV_UI_SELECTOR, plugins: capturePlugins},
      pick: () => grab.api.comment(),
      symbolicate: (input) => symbolicate(input.frames),
    })
    ctx.provide(ReactTree, makeReactTree())
    ctx.add(BrowserTabUrl, {redact: redactedUrl})

    return () => {
      operations.dispose()
      grab.dispose()
    }
  },
})

export function makeReactTree(): ReactTree {
  const refs: Refs = {map: new Map(), n: 0}
  return {
    rootFibers,
    dehydrate,
    describe,
    locate: (element) => locate(element, (found) => addRef(found, refs)),
    frames: reactBridge.framesForElement,
  }
}
