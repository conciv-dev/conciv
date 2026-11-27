import {useCallback, useState} from 'react'
import {createFileRoute, notFound} from '@tanstack/react-router'
import {RotateCcw} from 'lucide-react'
import {ViteReactPage} from '@/playground/pages/vite-react/vite-react-page'
import {isPlaygroundPage, isPlaygroundScriptId} from '@/playground/playground-scripts'
import {INITIAL_PAGE, type PageEdit, type PageState, type PlaygroundProgress} from '@/playground/script'
import {Button} from '@/components/ui/button'
import type {z} from 'zod'
import {
  mountPlayground,
  PLAYGROUND_HOST_CLASS,
  PlaygroundCommand,
  playgroundReport,
  type Playback,
} from '@/playground/shell-api'

export const Route = createFileRoute('/playground/$page/$')({
  loader: ({params}) => {
    const script = params._splat ?? ''
    if (!isPlaygroundPage(params.page) || !isPlaygroundScriptId(script)) throw notFound()
    return {script}
  },
  head: () => ({meta: [{title: 'conciv playground'}, {name: 'robots', content: 'noindex'}]}),
  component: PlaygroundFrame,
})

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function freezeAnimations(host: HTMLElement, command: 'hold' | 'resume'): void {
  const animations = [...document.getAnimations(), ...(host.shadowRoot?.getAnimations() ?? [])]
  animations
    .filter((animation) => animation.playState === (command === 'hold' ? 'running' : 'paused'))
    .forEach((animation) => (command === 'hold' ? animation.pause() : animation.play()))
}

function follow(instruction: z.infer<typeof PlaygroundCommand>, playback: Playback, host: HTMLElement): void {
  if (instruction.command === 'speed') {
    playback.setSpeed(instruction.speed)
    return
  }
  playback[instruction.command]()
  freezeAnimations(host, instruction.command)
}

function PlaygroundFrame() {
  const {script} = Route.useLoaderData()
  const [page, setPage] = useState<PageState>(INITIAL_PAGE)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const count = useCallback(() => setPage((current) => ({...current, count: current.count + 1})), [])
  const mount = useCallback(
    (host: HTMLDivElement | null) => {
      if (host === null) return
      const listening = new AbortController()
      const playground = mountPlayground({
        host,
        script,
        editPage: (edit: PageEdit) => setPage((current) => ({...current, ...edit})),
        onProgress: (progress: PlaygroundProgress) =>
          window.parent.postMessage(playgroundReport(progress), location.origin),
        onFailure: (error) => setFailure(describeFailure(error)),
      })
      window.addEventListener(
        'message',
        (event: MessageEvent<unknown>) => {
          if (event.source !== window.parent || event.origin !== location.origin) return
          const parsed = PlaygroundCommand.safeParse(event.data)
          const playback = playground.playback()
          if (!parsed.success || playback === undefined) return
          follow(parsed.data, playback, host)
        },
        {signal: listening.signal},
      )
      return () => {
        listening.abort()
        playground.stop()
      }
    },
    [script],
  )
  return (
    <div className="h-svh overflow-clip">
      <ViteReactPage page={page} onCount={count} />
      {failure === undefined ? (
        <div ref={mount} className={PLAYGROUND_HOST_CLASS} />
      ) : (
        <div className="fixed inset-0 flex items-center justify-center bg-fd-background/80 p-4">
          <div
            role="alert"
            className="flex max-w-md flex-col items-start gap-3 rounded-xl border bg-fd-card p-4 text-sm"
          >
            <p className="font-medium text-fd-foreground">The playground did not start.</p>
            <p className="text-fd-muted-foreground">{failure}</p>
            <Button type="button" variant="outline" onClick={() => location.reload()}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
