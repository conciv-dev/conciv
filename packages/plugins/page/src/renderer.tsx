import {Effect, Fiber} from 'effect'
import {z} from 'zod'
import {onCleanup} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import utilities from 'virtual:uno.css?inline'
import {createKeyed, Plugin, Slot, ToolRegistry} from '@conciv/plugin/experimental'
import {Page, PageOperation, ReactTree} from '@conciv/plugin/experimental/page'
import {GrabPicker} from '@conciv/plugin/experimental/grab'
import {NoteCard} from '@conciv/plugin-internal'
import {keepAttached, readTab, reportChanges} from './attachment.js'
import {makeHighlight} from './highlight.js'
import {symbolicateInSession} from './open-source.js'
import {makePageOperations} from './operations.js'
import {pageToolCards} from './cards.js'
import {SessionCaptures} from './captures.js'
import {PageFailedTool} from './shared.js'
import {endRun, endTask, mountSimulator} from './simulator.js'
import {CONCIV_UI_SELECTOR} from '@conciv/protocol/page-types'
import {addRef, type Refs} from './snapshot.js'
import {dehydrate} from './dehydrate.js'
import {describe, locate, reactBridge, rootFibers} from './react.js'
import {disposeReactGrab, grabApi} from './grab.js'
import {makeGrabNotePicker} from './grab-note.js'
import {GrabNoteCard} from './grab-card.js'
import {GRAB_NOTE_ORIGIN} from './rpc.js'
import {showToast} from './toast.js'
import {capturePlugins} from './screenshot.js'

const PageOptionsSchema = z.object({taskTimeoutMs: z.number().int().positive().optional()}).catch({})

export default Plugin.define({
  setup(ctx) {
    const {taskTimeoutMs} = PageOptionsSchema.parse(ctx.options)
    const connectionId = crypto.randomUUID()
    const tabId = `tab_${crypto.randomUUID()}`
    const routed = () => ctx.sessions.current()

    const symbolicate = symbolicateInSession(routed)

    const highlight = makeHighlight({
      opener: {symbolicate, desktop: ctx.desktop},
      toast: (title, variant) => void ctx.toast.show({title, variant}),
    })
    const operations = makePageOperations([highlight.effect])

    const tab = () => readTab(tabId)

    createKeyed(
      () => {
        const session = routed()

        return session?.server.compatible && session.server.connected ? session : undefined
      },
      (session) => {
        const kept = Effect.runFork(
          keepAttached({
            session,
            connectionId,
            tab,
            changed: reportChanges,
            operations,
            registered: () => ctx.list(PageOperation),
            notify: (title) => void ctx.toast.show({title, variant: 'error'}),
          }),
        )

        onCleanup(() => void Effect.runFork(Fiber.interrupt(kept)))
      },
    )

    ctx.add(Slot, {
      at: 'page.overlay',
      hides: false,
      render: () => (
        <div
          ref={(element) =>
            onCleanup(
              mountSimulator({
                root: element,
                session: () => routed()?.id ?? null,
                running: (sessionId) => routed()?.id === sessionId && routed()?.run.status() === 'running',
                taskTimeoutMs,
                onStop: (sessionId) => {
                  const session = routed()

                  if (session?.id === sessionId) void session.run.interrupt()
                  endTask()
                },
              }),
            )
          }
        />
      ),
    })

    createKeyed(
      () => {
        const session = routed()

        return session?.run.status() === 'running' ? session : undefined
      },
      (session) => onCleanup(() => endRun(session.id)),
    )

    onCleanup(highlight.mount(ctx.overlay({styles: [utilities]}).element))

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
    ctx.add(
      GrabPicker,
      makeGrabNotePicker(grabApi, {
        session: routed,
        screen: ctx.screen,
        symbolicate: (input) => symbolicate(input.frames),
      }),
    )
    ctx.add(NoteCard, {origins: [GRAB_NOTE_ORIGIN], render: (props) => <GrabNoteCard {...props} />})
    ctx.provide(Page, {...pageMembers, symbolicate: (input) => symbolicate(input.frames)})
    ctx.provide(ReactTree, makeReactTree())

    return () => {
      operations.dispose()
      disposeReactGrab()
    }
  },
})

export const pageMembers: Omit<Page, 'symbolicate'> = {
  toast: showToast,
  capture: {exclude: CONCIV_UI_SELECTOR, plugins: capturePlugins},
  pick: () => grabApi.comment(),
}

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
