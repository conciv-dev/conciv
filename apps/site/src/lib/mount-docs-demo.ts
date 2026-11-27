import {loadPlayground} from '@/playground/shell-api'

export function mountDocsDemo(host: HTMLElement): () => void {
  const state = {closed: false, stop: (): void => undefined}
  loadPlayground()
    .then((startPlayground) => {
      if (state.closed) return
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
      state.stop = startPlayground({host, script: 'docs/ask', reducedMotion, editPage: () => undefined}).stop
    })
    .catch((error: unknown) => console.error('conciv docs demo did not start', error))
  return () => {
    state.closed = true
    state.stop()
  }
}
