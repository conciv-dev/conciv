import {setTimeout as delay} from 'node:timers/promises'
import {z} from 'zod'
import type {SessionScope} from '../runtime/scope-types.js'

const TITLE_PROBE_MS = 1500

const RouteTitleSchema = z.object({title: z.string().min(1)})

export async function outsideRefusal(
  scope: SessionScope,
  client: string | null,
  reason: 'asked' | 'denied',
): Promise<string> {
  const who = client ?? 'An outside agent'
  const title = await pageTitle(scope)
  const tab = title === null ? 'the conciv tab' : `the conciv tab "${title}"`
  if (reason === 'denied') {
    return `The user denied ${who} access to ${tab}; do not retry unless they allow outside agents again from that tab.`
  }
  return `${who} is waiting for the user to allow it in ${tab}; retry after they click Approve.`
}

async function pageTitle(scope: SessionScope): Promise<string | null> {
  const answered = scope.page.ask('page_route', {}).then(
    (result) => RouteTitleSchema.safeParse(result).data?.title ?? null,
    () => null,
  )
  return Promise.race([answered, delay(TITLE_PROBE_MS, null)])
}
