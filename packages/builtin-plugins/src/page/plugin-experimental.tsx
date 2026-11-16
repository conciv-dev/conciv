import {onCleanup} from 'solid-js'
import {createKeyed, Plugin, type MountedSession} from '@conciv/plugin/experimental'
import {Page, PageEffect, ReactTree} from '@conciv/plugin/experimental/page'
import {Definition, type Tab} from '@conciv/plugin-page/rpc'
import type {LocateResult} from '@conciv/protocol/page-introspect-types'
import {openAttachment} from './attachment.js'
import {mountHighlight, type OpenedSource} from './highlight.js'
import {makeReactTree, pageMembers} from './contracts.js'
import {makePageOperations} from './operations.js'
import {endRun, endTask, mountSimulator} from './simulator.js'

const TAB_EVENTS = ['focus', 'blur', 'popstate', 'hashchange']

const WAKE_EVENTS = ['focus', 'pointerdown', 'keydown']

function reportChanges(report: () => void, signal: AbortSignal) {
  TAB_EVENTS.forEach((type) => window.addEventListener(type, report, {signal}))
  document.addEventListener('visibilitychange', report, {signal})
}

function woken(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const options = {once: true, signal}

    WAKE_EVENTS.forEach((type) => window.addEventListener(type, () => resolve(), options))
    document.addEventListener('visibilitychange', () => resolve(), options)
    signal.addEventListener('abort', () => resolve(), {once: true})
  })
}

function mountShadowHost() {
  const host = document.createElement('div')

  host.setAttribute('data-conciv-root', '')
  document.body.append(host)

  return {root: host.attachShadow({mode: 'open'}), remove: () => host.remove()}
}

export default Plugin.define({
  setup(ctx) {
    const connectionId = crypto.randomUUID()
    const tabId = `tab_${crypto.randomUUID()}`
    const operations = makePageOperations(ctx)
    const unsupported = new Set<string>()
    const routed = () => ctx.sessions.current()

    const tab = (): Tab => ({
      id: tabId,
      url: location.href,
      title: document.title,
      focused: document.hasFocus(),
      visible: document.visibilityState === 'visible',
    })

    const keep = async (session: MountedSession, signal: AbortSignal) => {
      for (;;) {
        const end = await openAttachment({session, connectionId, tab, changed: reportChanges, operations, signal})

        if (signal.aborted) return

        if (end.outcome === 'unsupported' || end.outcome === 'unavailable')
          return void unsupported.add(session.server.id)

        if (end.outcome === 'replaced' || !end.attached) return
        await woken(signal)

        if (signal.aborted) return
      }
    }

    createKeyed(
      () => {
        const session = routed()

        return session?.server.compatible && !unsupported.has(session.server.id) ? session : undefined
      },
      (session) => {
        const controller = new AbortController()

        onCleanup(() => controller.abort())
        void keep(session, controller.signal)
      },
    )

    const shadow = mountShadowHost()
    const unmount = mountSimulator({
      root: shadow.root,
      session: () => routed()?.id ?? null,
      running: (sessionId) => routed()?.id === sessionId && routed()?.run.status() === 'running',
      onStop: (sessionId) => {
        const session = routed()

        if (session?.id === sessionId) void session.run.interrupt()
        endTask()
      },
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

    const highlight = mountHighlight({
      root: shadow.root,
      open: openSource,
      toast: (title, variant) => void ctx.toast.show({title, variant}),
    })
    ctx.add(PageEffect, highlight.effect)

    ctx.provide(Page, {...pageMembers, symbolicate: (input) => symbolicate(input.frames)})
    ctx.provide(ReactTree, makeReactTree())

    return () => {
      unmount()
      highlight.dispose()
      shadow.remove()
      operations.dispose()
    }
  },
})
