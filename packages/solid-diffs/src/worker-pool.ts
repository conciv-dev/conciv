import {onCleanup} from 'solid-js'
import {getOrCreateWorkerPoolSingleton, type WorkerPoolManager} from '@pierre/diffs/worker'
import type {FileDiffOptions} from '@pierre/diffs'

const HIGHLIGHT_WORKER_COUNT = 2

export type DiffsRenderOptions = Pick<
  FileDiffOptions<undefined, undefined>,
  'theme' | 'useTokenTransformer' | 'tokenizeMaxLineLength' | 'lineDiffType' | 'maxLineDiffLength'
>

function highlightWorkerPool(options: DiffsRenderOptions | undefined): Promise<WorkerPoolManager | undefined> {
  if (typeof Worker === 'undefined') return Promise.resolve(undefined)
  return import('@pierre/diffs/worker/worker-portable.js?worker&inline').then(
    ({default: DiffsHighlightWorker}) =>
      getOrCreateWorkerPoolSingleton({
        poolOptions: {
          workerFactory: () => new DiffsHighlightWorker(),
          poolSize: HIGHLIGHT_WORKER_COUNT,
        },
        highlighterOptions: {
          theme: options?.theme,
          useTokenTransformer: options?.useTokenTransformer,
          tokenizeMaxLineLength: options?.tokenizeMaxLineLength,
          lineDiffType: options?.lineDiffType,
          maxLineDiffLength: options?.maxLineDiffLength,
        },
      }),
    () => undefined,
  )
}

export function withHighlightWorkerPool(
  options: DiffsRenderOptions | undefined,
  start: (pool: WorkerPoolManager | undefined) => void,
): void {
  let disposed = false
  onCleanup(() => (disposed = true))
  void highlightWorkerPool(options).then((pool) => {
    if (!disposed) start(pool)
  })
}

export function primeHighlightWorkerPool(options: DiffsRenderOptions | undefined): void {
  void highlightWorkerPool(options)
}
