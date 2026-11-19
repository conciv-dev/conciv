import {Effect, Fiber} from 'effect'
import {onCleanup} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import utilities from 'virtual:uno.css?inline'
import {createKeyed, Plugin, Slot, ToolRegistry} from '@conciv/plugin/experimental'
import {Page, PageOperation, ReactTree} from '@conciv/plugin/experimental/page'
import {Definition} from '@conciv/plugin-page/rpc'
import {keepAttached} from './attachment.js'
import {makeHighlight} from './highlight.js'
import {makeReactTree, pageMembers} from './contracts.js'
import {makePageOperations} from './operations.js'
import {pageToolCards} from './cards/page-tool-cards.js'
import {SessionCaptures} from './session-captures.js'
import {PageFailedTool} from './cards/shared.js'
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
    ctx.provide(Page, {...pageMembers, symbolicate: (input) => symbolicate(input.frames)})
    ctx.provide(ReactTree, makeReactTree())

    return () => operations.dispose()
  },
})
