import {useCallback, useState} from 'react'
import {createFileRoute, notFound} from '@tanstack/react-router'
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

function PlaygroundFrame() {
  const {script} = Route.useLoaderData()
  const [page, setPage] = useState<PageState>(INITIAL_PAGE)
  const count = useCallback(() => setPage((current) => ({...current, count: current.count + 1})), [])
  const mount = useCallback(
    (host: HTMLDivElement | null) => {
      if (host === null) return
      const state = {closed: false, stop: (): void => undefined}
      const editPage = (edit: PageEdit): void => setPage((current) => ({...current, ...edit}))
      import(/* @vite-ignore */ PLAYGROUND_SHELL_URL)
        .then((loaded: unknown) => {
          if (state.closed) return
          const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
          state.stop = ShellModule.parse(loaded).startPlayground({host, script, reducedMotion, editPage})
        })
        .catch((error: unknown) => console.error('[playground] the widget did not start', error))
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
      <div ref={mount} />
    </>
  )
}
