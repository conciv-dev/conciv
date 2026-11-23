import {from} from 'solid-js'
import {isEqual} from 'es-toolkit'
import type {QueryClient} from '@conciv/client'
import type {ServerData} from '@conciv/plugin/experimental'
import type {AppData} from '../../data/app-data'

export function createServerData(utils: AppData['utils'], queryClient: QueryClient): ServerData {
  const models = (sessionId: string) => utils.meta.models.queryOptions({input: {sessionId}})
  const [modelsPath] = utils.meta.models.key()
  const modelsChanged = from<number>(
    (set) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (isEqual(event.query.queryKey[0], modelsPath)) set((count = 0) => count + 1)
      }),
    0,
  )

  return {
    meta: {
      models: {
        get: (sessionId) => {
          modelsChanged()
          return queryClient.getQueryData(models(sessionId).queryKey)
        },
        failed: (sessionId) => {
          modelsChanged()
          return queryClient.getQueryState(models(sessionId).queryKey)?.status === 'error'
        },
        sync: async (sessionId) => {
          await queryClient.fetchQuery({...models(sessionId), staleTime: Infinity})
        },
        invalidate: (sessionId) => void queryClient.invalidateQueries({queryKey: models(sessionId).queryKey}),
      },
    },
  }
}
