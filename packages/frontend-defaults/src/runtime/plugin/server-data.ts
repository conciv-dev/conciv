import {useQuery} from '@conciv/client'
import type {ServerData} from '@conciv/frontend-plugin-api'
import type {AppData} from '../../data/app-data'

export function createServerData(utils: AppData['utils']): ServerData {
  return {
    meta: {
      models: (sessionId) =>
        useQuery(() => ({
          ...utils.meta.models.queryOptions({input: {sessionId: sessionId() ?? ''}}),
          enabled: sessionId() !== undefined,
          retry: false,
          refetchOnWindowFocus: false,
        })),
    },
  }
}
