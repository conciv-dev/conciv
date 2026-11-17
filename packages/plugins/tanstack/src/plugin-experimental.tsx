import {onCleanup} from 'solid-js'
import {createKeyed, Plugin, Slot, type MountedSession} from '@conciv/plugin/experimental'
import {ReactTree} from '@conciv/plugin/experimental/page'
import {openAttachment} from './client/attachment.js'
import {installRuntimeErrorListeners} from './client/error-ring.js'
import {InspectorChip} from './client/inspector-chip.js'
import {makeTanstackOperations} from './client/operations.js'
import type {Tab} from './rpc.js'

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

export default Plugin.define({
  setup(ctx) {
    const connectionId = crypto.randomUUID()
    const tabId = `tab_${crypto.randomUUID()}`
    const operations = makeTanstackOperations(ctx.use(ReactTree))
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

    ctx.add(Slot, {at: 'session.status', render: () => <InspectorChip ui={ctx.ui} />})

    onCleanup(installRuntimeErrorListeners())
  },
})
