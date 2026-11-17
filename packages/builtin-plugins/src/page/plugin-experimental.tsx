import {createComponent, onCleanup, type Accessor, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {createKeyed, Plugin, Slot, type MountedSession} from '@conciv/plugin/experimental'
import {ToolCall} from '@conciv/plugin/experimental/builtin'
import {Page, PageEffect, ReactTree} from '@conciv/plugin/experimental/page'
import {Definition, type Tab} from '@conciv/plugin-page/rpc'
import type {LocateResult} from '@conciv/protocol/page-introspect-types'
import {openAttachment} from './attachment.js'
import {makeHighlight, type OpenedSource} from './highlight.js'
import {makeReactTree, pageMembers} from './contracts.js'
import {makePageOperations} from './operations.js'
import {pageToolCalls} from './cards/page-tool-cards.js'
import {endRun, endTask, mountSimulator} from './simulator.js'

const TAB_EVENTS = ['focus', 'blur', 'popstate', 'hashchange']

const WAKE_EVENTS = ['focus', 'pointerdown', 'keydown']

const RETRY_BASE_MS = 1000

const RETRY_MAX_MS = 30_000

function reportChanges(report: () => void, signal: AbortSignal) {
  TAB_EVENTS.forEach((type) => window.addEventListener(type, report, {signal}))
  document.addEventListener('visibilitychange', report, {signal})
}

function woken(signal: AbortSignal) {
  const woke = new AbortController()
  const options = {once: true, signal: AbortSignal.any([signal, woke.signal])}

  return new Promise<void>((resolve) => {
    WAKE_EVENTS.forEach((type) => window.addEventListener(type, () => resolve(), options))
    document.addEventListener('visibilitychange', () => resolve(), options)
    signal.addEventListener('abort', () => resolve(), {once: true, signal: woke.signal})
  }).finally(() => woke.abort())
}

function HighlightHost(props: {
  mode: Accessor<'light' | 'dark'>
  mount: (root: ShadowRoot) => () => void
}): JSX.Element {
  return (
    <Portal mount={document.body}>
      <div
        data-conciv-effects
        classList={{light: props.mode() === 'light', dark: props.mode() === 'dark'}}
        style={{position: 'fixed', 'z-index': '2147483000'}}
        ref={(element) => onCleanup(props.mount(element.attachShadow({mode: 'open'})))}
      />
    </Portal>
  )
}

export default Plugin.define({
  setup(ctx) {
    const connectionId = crypto.randomUUID()
    const tabId = `tab_${crypto.randomUUID()}`
    const operations = makePageOperations(ctx)
    const routed = () => ctx.sessions.current()

    const tab = (): Tab => ({
      id: tabId,
      url: location.href,
      title: document.title,
      focused: document.hasFocus(),
      visible: document.visibilityState === 'visible',
    })

    const keep = async (session: MountedSession, signal: AbortSignal) => {
      for (let refusals = 0; ;) {
        const retryMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** refusals)
        const end = await openAttachment({
          session,
          connectionId,
          tab,
          changed: reportChanges,
          operations,
          signal,
          retryMs,
        })

        if (signal.aborted) return

        refusals = end.outcome === 'refused' ? refusals + 1 : 0

        if (end.outcome === 'born' || end.outcome === 'refused') continue

        if (end.outcome !== 'closed' || !end.attached) return
        await woken(signal)

        if (signal.aborted) return
      }
    }

    createKeyed(
      () => {
        const session = routed()

        return session?.server.compatible && session.server.connected ? session : undefined
      },
      (session) => {
        const controller = new AbortController()

        onCleanup(() => controller.abort())
        void keep(session, controller.signal)
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

    const symbolicate = (frames: Parameters<Page['symbolicate']>[0]['frames']) => {
      const session = routed()

      if (!session) return Promise.reject(new Error('Page.symbolicate needs a routed session'))

      return session.server.client.rpc(Definition).symbolicate({frames: [...frames]})
    }

    const openSource = async (located: LocateResult): Promise<OpenedSource> => {
      const desktop = ctx.desktop

      if (!desktop) return 'failed'
      try {
        const frames = located.frames.flatMap(({fileName, line, column}) =>
          fileName === undefined || line === undefined ? [] : [{fileName, line, column}],
        )
        const source = located.source ?? (frames.length > 0 ? await symbolicate(frames) : null)

        if (!source) return 'no-source'
        await desktop.launch(source.file, {line: source.line, column: source.column})
        return 'opened'
      } catch {
        return 'failed'
      }
    }

    const highlight = makeHighlight({
      open: openSource,
      toast: (title, variant) => void ctx.toast.show({title, variant}),
    })
    ctx.add(PageEffect, highlight.effect)
    createComponent(HighlightHost, {mode: () => ctx.appearance.mode(), mount: highlight.mount})

    pageToolCalls.forEach((call) => ctx.add(ToolCall, call))
    ctx.provide(Page, {...pageMembers, symbolicate: (input) => symbolicate(input.frames)})
    ctx.provide(ReactTree, makeReactTree())

    return () => operations.dispose()
  },
})
