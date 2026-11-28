import type {Register} from '@tanstack/react-router'
import * as Sentry from '@sentry/cloudflare'
import {env} from 'cloudflare:workers'
import {wrapFetchWithSentry} from '@sentry/tanstackstart-react'
import handler from '@tanstack/react-start/server-entry'
import type {RequestOptions} from '@tanstack/react-start/server'
import {sentryOptions} from './lib/sentry-options'
import {readStarCount} from './lib/star-count.server'
import {withStarCount} from './lib/star-count-rewriter'

function isPage(response: Response): boolean {
  return response.ok && (response.headers.get('content-type')?.startsWith('text/html') ?? false)
}

async function fetchPage(request: Request, opts?: RequestOptions<Register>): Promise<Response> {
  if (request.method !== 'GET') return handler.fetch(request, opts)
  const asset = await env.ASSETS.fetch(request)
  if (asset.status === 404) return handler.fetch(request, opts)
  return isPage(asset) ? withStarCount(asset, await readStarCount()) : asset
}

const worker: ExportedHandler<Env> = Sentry.withSentry(() => sentryOptions(), wrapFetchWithSentry({fetch: fetchPage}))

export default worker
