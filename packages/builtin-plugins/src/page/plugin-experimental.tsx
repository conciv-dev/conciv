import {Effect, Fiber} from 'effect'
import {onCleanup} from 'solid-js'
import utilities from 'virtual:uno.css?inline'
import {createKeyed, Plugin, Slot} from '@conciv/plugin/experimental'
import {ToolCall} from '@conciv/plugin/experimental/builtin'
import {Page, PageOperation, ReactTree} from '@conciv/plugin/experimental/page'
import {Definition} from '@conciv/plugin-page/rpc'
import {keepAttached} from './attachment.js'
import {makeHighlight} from './highlight.js'
import {makeReactTree, pageMembers} from './contracts.js'
import {makePageOperations} from './operations.js'
import {pageToolCalls} from './cards/page-tool-cards.js'
import {endRun, endTask, mountSimulator} from './simulator.js'
import {readTab, reportChanges} from './tab.js'

export default Plugin.define({
  setup(ctx) {
    const connectionId = crypto.randomUUID()
    const tabId = `tab_${crypto.randomUUID()}`
    const routed = () => ctx.sessions.current()

    const symbolicate = (frames: Parameters<Page['symbolicate']>[0]['frames']) => {
      const session = routed()

      if (!session) return Promise.reject(new Error('Page.symbolicate needs a routed session'))

      return session.server.client.rpc(Definition).symbolicate({frames: [...frames]})
    }

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

    pageToolCalls.forEach((call) => ctx.add(ToolCall, call))
    ctx.provide(Page, {...pageMembers, symbolicate: (input) => symbolicate(input.frames)})
    ctx.provide(ReactTree, makeReactTree())

    return () => operations.dispose()
  },
})
