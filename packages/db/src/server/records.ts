import {initClient} from 'trailbase'
import {decorateError} from '@conciv/errors'

export type RecordsClient = {
  list(api: string, filter?: Record<string, string>): Promise<unknown[]>
  getBy(api: string, field: string, value: string): Promise<unknown>
  create(api: string, body: Record<string, unknown>): Promise<string>
  update(api: string, id: string, patch: Record<string, unknown>): Promise<void>
  remove(api: string, id: string): Promise<void>
}

async function guarded<T>(api: string, action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught))
    const status = 'status' in error ? error.status : undefined
    throw decorateError({
      error,
      code: 'records-request-failed',
      userCode: 'state.records-request-failed',
      statusCode: 502,
      details: {api, action, status},
    })
  }
}

export function recordsClient(baseUrl: string): RecordsClient {
  const client = initClient(baseUrl)
  const list = (api: string, filter?: Record<string, string>): Promise<unknown[]> =>
    guarded(api, 'list', async () => {
      const filters = Object.entries(filter ?? {}).map(([column, value]) => ({column, value}))
      const response = await client.records(api).list({filters})
      return response.records
    })
  return {
    list,
    getBy: async (api, field, value) => (await list(api, {[field]: value}))[0] ?? null,
    create: (api, body) => guarded(api, 'create', async () => String(await client.records(api).create(body))),
    update: (api, id, patch) => guarded(api, 'update', () => client.records(api).update(id, patch)),
    remove: (api, id) => guarded(api, 'remove', () => client.records(api).delete(id)),
  }
}
