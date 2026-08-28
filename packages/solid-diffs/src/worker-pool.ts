import DiffsHighlightWorker from '@pierre/diffs/worker/worker-portable.js?worker&inline'
import {getOrCreateWorkerPoolSingleton, type WorkerPoolManager} from '@pierre/diffs/worker'
import type {FileDiffOptions} from '@pierre/diffs'

const HIGHLIGHT_WORKER_COUNT = 2

export type DiffsRenderOptions = Pick<
  FileDiffOptions<undefined>,
  'theme' | 'useTokenTransformer' | 'tokenizeMaxLineLength' | 'lineDiffType' | 'maxLineDiffLength'
>

export function highlightWorkerPool(options: DiffsRenderOptions | undefined): WorkerPoolManager | undefined {
  if (typeof Worker === 'undefined') return undefined
  return getOrCreateWorkerPoolSingleton({
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
  })
}
