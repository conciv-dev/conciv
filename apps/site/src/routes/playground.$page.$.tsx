import {useCallback, useState} from 'react'
import {createFileRoute, notFound} from '@tanstack/react-router'
import {RotateCcw} from 'lucide-react'
import {z} from 'zod'
import {ViteReactPage} from '@/playground/pages/vite-react/vite-react-page'
import {isPlaygroundPage, isPlaygroundScriptId} from '@/playground/playground-scripts'
import {INITIAL_PAGE, type PageEdit, type PageState} from '@/playground/script'
import {PLAYGROUND_SHELL_URL, type StartPlayground} from '@/playground/shell-api'

const ShellModule = z.object({
  startPlayground: z.custom<StartPlayground>((value) => typeof value === 'function'),
})

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

function PlaygroundFrame() {
  const {script} = Route.useLoaderData()
  const [page, setPage] = useState<PageState>(INITIAL_PAGE)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const count = useCallback(() => setPage((current) => ({...current, count: current.count + 1})), [])
  const mount = useCallback(
    (host: HTMLDivElement | null) => {
      if (host === null) return
      const state = {closed: false, stop: (): void => undefined}
      const editPage = (edit: PageEdit): void => setPage((current) => ({...current, ...edit}))
      import(/* @vite-ignore */ new URL(PLAYGROUND_SHELL_URL, document.baseURI).href)
        .then((loaded: unknown) => {
          if (state.closed) return
          const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
          state.stop = ShellModule.parse(loaded).startPlayground({host, script, reducedMotion, editPage})
        })
        .catch((error: unknown) => {
          if (!state.closed) setFailure(describeFailure(error))
        })
      return () => {
        state.closed = true
        state.stop()
      }
    },
    [script],
  )
  return (
    <>
      <ViteReactPage page={page} onCount={count} />
      {failure === undefined ? (
        <div ref={mount} />
      ) : (
        <div className="fixed inset-0 flex items-center justify-center bg-fd-background/80 p-4">
          <div
            role="alert"
            className="flex max-w-md flex-col items-start gap-3 rounded-xl border bg-fd-card p-4 text-sm"
          >
            <p className="font-medium text-fd-foreground">The playground did not start.</p>
            <p className="text-fd-muted-foreground">{failure}</p>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-fd-secondary px-3 py-1.5 font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent"
              onClick={() => location.reload()}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      )}
    </>
  )
}
