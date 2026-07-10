import {Outlet, createFileRoute, useRouter} from '@tanstack/solid-router'
import {useQuery} from '@tanstack/solid-query'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {ChevronDown, PictureInPicture2} from 'lucide-solid'
import type {JSX} from 'solid-js'
import {useApp} from '../app/context.js'
import {SessionSelector} from '../composer/session-selector.js'
import {ContextTracker} from '../chat/context-tracker.js'

const HEAD = 'flex items-center gap-2.5 py-3 px-3.5 border-b border-b-pw-line-soft'
const CLOSE =
  'bg-transparent [border:none] text-pw-text-2 text-[1.375rem] cursor-pointer inline-flex items-center justify-center size-9.5 rounded-[0.5625rem] trans-color-bg hover:text-pw-text hover:bg-pw-fill-strong'

export const Route = createFileRoute('/panel/$sessionId')({component: PanelSession})

function PanelSession(): JSX.Element {
  const params = Route.useParams()
  const app = useApp()
  const router = useRouter()
  const sessions = useQuery(() => app.data.utils.sessions.list.queryOptions())
  const usage = () => (sessions.data ?? []).find((session) => session.id === params().sessionId)?.usage ?? null

  const activate = (id: string) => void router.navigate({to: '/panel/$sessionId', params: {sessionId: id}})
  const newSession = async () => {
    const {sessionId} = await app.rpc.sessions.create(undefined)
    app.data.invalidateSessions()
    activate(sessionId)
    app.announce('Started a new session')
  }

  return (
    <>
      <header class={HEAD}>
        <TooltipIconButton
          tooltip="Pop out to a window"
          class={CLOSE}
          onClick={() => void router.navigate({to: '/pip/$sessionId', params: {sessionId: params().sessionId}})}
        >
          <PictureInPicture2 class="size-5 block" aria-hidden="true" />
        </TooltipIconButton>
        <span class="tracking-[-0.01em] font-semibold">conciv</span>
        <SessionSelector
          variant="pill"
          activeId={() => params().sessionId}
          onActivate={activate}
          onNewSession={() => void newSession()}
        />
        <ContextTracker usage={usage()} />
        <TooltipIconButton tooltip="Close chat" class={`${CLOSE} ml-auto`} onClick={() => router.history.back()}>
          <ChevronDown class="size-[1em] block" aria-hidden="true" />
        </TooltipIconButton>
      </header>
      <Outlet />
    </>
  )
}
