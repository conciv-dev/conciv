import {onCleanup} from 'solid-js'
import {createKeyed, Plugin, Slot, type MountedSession} from '@conciv/plugin/experimental'
import {ReactTree} from '@conciv/plugin/experimental/page'
import {openAttachment} from './client/attachment.js'
import {installRuntimeErrorListeners} from './client/error-ring.js'
import {InspectorChip} from './client/inspector-chip.js'
import {makeTanstackOperations} from './client/operations.js'
import {redactedHref} from './client/router-adapter.js'
import {SHORT_MAX, TAB_URL_MAX, type Tab} from './rpc.js'

const TAB_EVENTS = ['focus', 'blur']

const WAKE_EVENTS = ['focus', 'pointerdown', 'keydown']

const RETRY_BASE_MS = 1000

const RETRY_MAX_MS = 30_000

function woken(signal: AbortSignal) {
  const woke = new AbortController()
  const options = {once: true, signal: AbortSignal.any([signal, woke.signal])}

  return new Promise<void>((resolve) => {
    WAKE_EVENTS.forEach((type) => window.addEventListener(type, () => resolve(), options))
    document.addEventListener('visibilitychange', () => resolve(), options)
    signal.addEventListener('abort', () => resolve(), {once: true, signal: woke.signal})
  }).finally(() => woke.abort())
}

export default Plugin.define({
  setup(ctx) {
    const connectionId = crypto.randomUUID()
    const tabId = `tab_${crypto.randomUUID()}`
    const tree = ctx.use(ReactTree)
    const operations = makeTanstackOperations(tree)
    const routed = () => ctx.sessions.current()

    const tabUrl = () => {
      const live = tree()
      return live.status === 'active' ? redactedHref(live.value) : `${location.origin}${location.pathname}`
    }

    const reportChanges = (report: () => void, signal: AbortSignal) => {
      TAB_EVENTS.forEach((type) => window.addEventListener(type, report, {signal}))
      document.addEventListener('visibilitychange', report, {signal})
      navigation.addEventListener('currententrychange', report, {signal})
      const last = {title: document.title}
      const titles = new MutationObserver(() => {
        if (document.title === last.title) return
        last.title = document.title
        report()
      })

      titles.observe(document.head, {childList: true, subtree: true, characterData: true})
      signal.addEventListener('abort', () => titles.disconnect(), {once: true})
    }

    const tab = (): Tab => ({
      id: tabId,
      url: tabUrl().slice(0, TAB_URL_MAX),
      title: document.title.slice(0, SHORT_MAX),
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

    ctx.add(Slot, {at: 'session.status', render: () => <InspectorChip ui={ctx.ui} />})

    onCleanup(installRuntimeErrorListeners())
  },
})
